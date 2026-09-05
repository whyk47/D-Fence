/**
 * D-Fence — Lab 4 §3.2: the audit trail (US-2.5, §2.4).
 *
 * §2.4 is two sentences and it was two-thirds implemented. Registration, sign-in, sign-out and
 * staff provisioning wrote rows; **report moderation and work-order assignment wrote nothing** —
 * which is precisely the pair US-2.5's own acceptance names, and precisely the pair a review of a
 * dispatch decision would ask about. A trail that covers authentication and not operations records
 * who logged in and not who sent a crew somewhere.
 *
 * The design that fixes it is the one already used for status notifications: **the single write
 * path is the single audit point.** `ReportLifecycleController.transition` and
 * `WorkOrderLifecycleController.transition` each own their entity's status, so a hook there cannot
 * be forgotten by a future caller. The cases below test that property rather than testing each
 * call site, because the property is what stops the next hole appearing.
 */
import { describe, expect, it } from 'vitest';
import { InMemoryAuditStore, InMemoryClusterStore } from '../src/persistence/memory/InMemoryStores';
import { InMemoryReportStore, InMemoryClusterLocator } from '../src/persistence/memory/InMemoryReportStores';
import {
  InMemoryTreatmentRecordStore,
  InMemoryWorkOrderStore,
  RecordingNotifier,
} from '../src/persistence/memory/InMemoryWorkOrderStores';
import { AccessControlService } from '../src/control/AccessControlService';
import { AccessPolicy } from '../src/control/AccessPolicy';
import { ReportTransitionTable } from '../src/control/ReportTransitionTable';
import { ReportLifecycleController } from '../src/control/ReportLifecycleController';
import { ReportController } from '../src/control/ReportController';
import { ModerationController } from '../src/control/ModerationController';
import { WorkOrderTransitionTable } from '../src/control/WorkOrderTransitionTable';
import { WorkOrderLifecycleController } from '../src/control/WorkOrderLifecycleController';
import { DispatchController } from '../src/control/DispatchController';
import { AuditController } from '../src/control/AuditController';
import { Principal, SYSTEM_ACTOR_ID } from '../src/control/Principal';
import { Cluster } from '../src/entity/Cluster';
import { GeoPoint, Polygon, PremisesMix } from '../src/entity/valueTypes';
import { ChangeClass, ReportType, Role, TaskType, WorkOrderStatus } from '../src/entity/enums';

const MANAGER = new Principal('manager-1', Role.OperationsManager, 'session-m');
const CREW = new Principal('crew-1', Role.CleaningCrew, 'session-c');
const RESIDENT = new Principal('resident-1', Role.Resident, 'session-r');
const NEIGHBOUR = new Principal('resident-2', Role.Resident, 'session-n');

/** Tomorrow in Singapore time — 8.1.4 refuses a scheduled date in the past. */
function tomorrow(): string {
  return new Date(Date.now() + 8 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
}

async function fixture(): Promise<{
  audit: InMemoryAuditStore;
  reports: ReportController;
  moderation: ModerationController;
  dispatch: DispatchController;
  lifecycle: WorkOrderLifecycleController;
  reportStore: InMemoryReportStore;
  clusterId: string;
}> {
  const audit = new InMemoryAuditStore();
  const ac = new AccessControlService(new AccessPolicy(), audit);

  const cluster = new Cluster();
  cluster.objectId = 'c-1';
  cluster.locality = 'Bishan St 12';
  cluster.caseSize = 12;
  cluster.caseDelta = 2;
  cluster.changeClass = ChangeClass.GROWN;
  cluster.isActive = true;
  cluster.heavyRainExpected = false;
  cluster.premisesMix = new PremisesMix();
  cluster.boundary = new Polygon([
    [
      new GeoPoint(1.35, 103.84),
      new GeoPoint(1.35, 103.85),
      new GeoPoint(1.36, 103.85),
      new GeoPoint(1.36, 103.84),
      new GeoPoint(1.35, 103.84),
    ],
  ]);
  const clusters = new InMemoryClusterStore();
  await clusters.upsertFromFeed({ retrievedAt: new Date(), records: [cluster] });
  const stored = (await clusters.findActive())[0] as Cluster;

  const reportStore = new InMemoryReportStore();
  const notifier = new RecordingNotifier();
  const reportLifecycle = new ReportLifecycleController(new ReportTransitionTable(), reportStore, notifier, audit);
  const workOrders = new InMemoryWorkOrderStore();
  const lifecycle = new WorkOrderLifecycleController(
    new WorkOrderTransitionTable(),
    workOrders,
    new InMemoryTreatmentRecordStore(),
    notifier,
    null,
    reportLifecycle,
    audit,
  );

  return {
    audit,
    reports: new ReportController(ac, reportStore, new InMemoryClusterLocator(clusters), reportLifecycle, audit),
    moderation: new ModerationController(ac, reportStore, reportLifecycle),
    dispatch: new DispatchController(
      ac,
      lifecycle,
      workOrders,
      clusters,
      { saveAll: async () => undefined, historyFor: async () => [], latest: async () => [] },
      notifier,
      reportLifecycle,
      10,
      audit,
    ),
    lifecycle,
    reportStore,
    clusterId: stored.id,
  };
}

async function submitReport(f: Awaited<ReturnType<typeof fixture>>): Promise<string> {
  const report = await f.reports.submitReport(
    {
      type: ReportType.StandingWater,
      description: 'Water standing in an uncovered drum behind the void deck',
      point: new GeoPoint(1.355, 103.845),
    },
    RESIDENT,
  );
  return report.id;
}

describe('2.4.1 — the two operations US-2.5 names by hand', () => {
  it('A1 — report moderation produces an entry naming the moderator and the report', async () => {
    const f = await fixture();
    const reportId = await submitReport(f);
    await f.moderation.verify(reportId, MANAGER);

    const entries = await f.audit.recent(50);
    const verified = entries.find((e) => e.action.includes('Verified'));
    expect(verified).toBeDefined();
    // All four fields of 2.4.1: who, what, which thing, when.
    expect(verified?.accountId).toBe('manager-1');
    expect(verified?.targetEntity).toBe('Report');
    expect(verified?.targetId).toBe(reportId);
    expect(verified?.occurredAt).toBeInstanceOf(Date);
  });

  it('A2 — a work-order assignment produces an entry naming the manager and the crew member', async () => {
    const f = await fixture();
    const workOrder = await f.dispatch.createWorkOrder(
      { clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() },
      MANAGER,
    );
    await f.dispatch.assign(workOrder.id, 'crew-1', MANAGER);

    const actions = (await f.audit.recent(50)).map((e) => e.action);
    expect(actions).toContain('workOrder:assign:crew-1');
    // Two rows, deliberately: the assignee changed AND the status changed. A reviewer asking
    // "who moved this to Assigned" and "who put Ah Meng on it" is asking two questions.
    expect(actions).toContain(`workOrder:status:${WorkOrderStatus.Created} -> ${WorkOrderStatus.Assigned}`);
  });

  it('A3 — a reassignment records who it was taken from as well as who it went to', async () => {
    const f = await fixture();
    const workOrder = await f.dispatch.createWorkOrder(
      { clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() },
      MANAGER,
    );
    await f.dispatch.assign(workOrder.id, 'crew-1', MANAGER);
    await f.dispatch.reassign(workOrder.id, 'crew-2', MANAGER);

    const actions = (await f.audit.recent(50)).map((e) => e.action);
    // The assignment history holds the sequence; without the "from" here the log would not.
    expect(actions).toContain('workOrder:reassign:crew-1 -> crew-2');
  });
});

describe('2.4.1 — the single write path is the single audit point', () => {
  it('A4 — every work-order status move is recorded, by whoever made it', async () => {
    const f = await fixture();
    const workOrder = await f.dispatch.createWorkOrder(
      { clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() },
      MANAGER,
    );
    await f.dispatch.assign(workOrder.id, 'crew-1', MANAGER);
    await f.lifecycle.accept(workOrder.id, CREW);
    await f.lifecycle.start(workOrder.id, CREW);

    const statusRows = (await f.audit.recent(50)).filter((e) => e.action.startsWith('workOrder:status:'));
    // Created→Assigned by the manager, Assigned→Accepted and Accepted→In Progress by the crew.
    expect(statusRows).toHaveLength(3);
    expect(statusRows.filter((e) => e.accountId === 'crew-1')).toHaveLength(2);
    expect(statusRows.every((e) => e.targetId === workOrder.id)).toBe(true);
  });

  it('A5 — a REFUSED transition writes no action row: nothing changed', async () => {
    const f = await fixture();
    const workOrder = await f.dispatch.createWorkOrder(
      { clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() },
      MANAGER,
    );
    const before = (await f.audit.recent(50)).length;
    // Created → Completed is not on the table. 2.4.1 is about operations that CHANGE stored state;
    // logging a refused move as though it happened would make the trail unusable as evidence.
    await expect(f.lifecycle.transition(workOrder.id, WorkOrderStatus.Completed, CREW)).rejects.toThrow();
    const after = await f.audit.recent(50);
    expect(after.filter((e) => !e.action.startsWith('DENIED:'))).toHaveLength(before);
  });

  it('A6 — a system-initiated status change is attributed to the system, not to a bystander', async () => {
    const f = await fixture();
    const reportId = await submitReport(f);
    await f.moderation.verify(reportId, MANAGER);

    // 5.2.6 — a work order raised from the report moves it to Actioned with no user in the loop.
    const workOrder = await f.dispatch.createWorkOrder(
      { clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow(), sourceReportId: reportId },
      MANAGER,
    );
    await f.dispatch.linkVerifiedReports(workOrder.id, [reportId], f.reportStore); // 8.1.13
    await f.dispatch.assign(workOrder.id, 'crew-1', MANAGER);

    const systemRows = (await f.audit.recent(50)).filter((e) => e.accountId === SYSTEM_ACTOR_ID);
    // Attributing this to the manager would be a lie in the one log that exists to be trusted;
    // leaving it blank would make "nobody did this" and "we did not record who" indistinguishable.
    expect(systemRows.some((e) => e.action.includes('Actioned'))).toBe(true);
  });
});

describe('2.4.1 — the resident-facing writes', () => {
  it('A7 — a submission and a corroboration are both recorded against the right resident', async () => {
    const f = await fixture();
    const reportId = await submitReport(f);
    await f.reports.confirmExisting(reportId, NEIGHBOUR);

    const entries = await f.audit.recent(50);
    const submitted = entries.find((e) => e.action === 'report:submit');
    const confirmed = entries.find((e) => e.action === 'report:corroborate');
    expect(submitted?.accountId).toBe('resident-1');
    expect(submitted?.targetId).toBe(reportId);
    expect(confirmed?.accountId).toBe('resident-2');
    expect(confirmed?.targetId).toBe(reportId);
  });
});

describe('2.3.8, 2.4.1 — refusals and changes are tellable apart', () => {
  it('A8 — a refusal is logged with a DENIED prefix and is not counted as a change', async () => {
    const f = await fixture();
    const reportId = await submitReport(f);
    // 5.2.3 — a Resident may not moderate.
    await expect(f.moderation.verify(reportId, RESIDENT)).rejects.toThrow(/not authorised/);

    const entries = await f.audit.recent(50);
    const denial = entries.find((e) => e.action.startsWith('DENIED:'));
    expect(denial?.accountId).toBe('resident-1');
    // They mean opposite things. An unprefixed list of action names could not tell them apart,
    // and a reviewer counting "report:moderate" rows would count refusals as decisions.
    expect(entries.some((e) => e.action.includes('Verified'))).toBe(false);
  });
});

describe('2.4.2 — an audit record cannot be modified or deleted by any role', () => {
  it('A9 — reading the trail hands back copies, so a caller cannot rewrite history', async () => {
    const f = await fixture();
    await submitReport(f);

    const first = await f.audit.recent(10);
    const original = (first[0] as { action: string; occurredAt: Date }).action;
    (first[0] as { action: string }).action = 'report:definitely-not-this';
    (first[0] as { occurredAt: Date }).occurredAt = new Date(0);

    const second = await f.audit.recent(10);
    expect((second[0] as { action: string }).action).toBe(original);
    expect((second[0] as { occurredAt: Date }).occurredAt.getTime()).not.toBe(0);
  });

  it('A10 — the store exposes no update or delete at all', async () => {
    const f = await fixture();
    await submitReport(f);
    const store = f.audit as unknown as Record<string, unknown>;
    // The interface is the enforcement in memory; in Postgres it is a table with no UPDATE or
    // DELETE grant, which is where the real guarantee has to live (2.4.2).
    for (const forbidden of ['update', 'delete', 'remove', 'clear', 'truncate']) {
      expect(store[forbidden]).toBeUndefined();
    }
    expect(f.audit.size()).toBeGreaterThan(0);
  });
});

/**
 * 2.4.1 is only half a requirement while the trail cannot be read.
 *
 * Everything above establishes that the rows are *written*. Until 2026-09-05 there was no route,
 * no controller and — in the deployment — no table row either, because `server.ts` constructed the
 * in-memory store in production. A record nobody can read is indistinguishable from a record
 * nobody keeps, and `WorkOrderRoutes.ts` had been documenting an audit endpoint that did not exist.
 */
describe('2.4.1 — the trail can be read, by the one role entitled to read it', () => {
  async function readable(): Promise<{
    controller: AuditController;
    audit: InMemoryAuditStore;
    workOrderId: string;
    f: Awaited<ReturnType<typeof fixture>>;
  }> {
    const f = await fixture();
    const order = await f.dispatch.createWorkOrder(
      { clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() },
      MANAGER,
    );
    await f.dispatch.assign(order.id, CREW.accountId, MANAGER);
    await f.lifecycle.accept(order.id, CREW);
    const controller = new AuditController(
      new AccessControlService(new AccessPolicy(), f.audit),
      f.audit,
    );
    return { controller, audit: f.audit, workOrderId: order.id, f };
  }

  it('A11 — a manager reads the trail; a resident and a crew member are refused (2.3.4)', async () => {
    const { controller } = await readable();

    expect((await controller.recent(50, MANAGER)).length).toBeGreaterThan(0);
    // The trail names every actor and every target in the system. Unrestricted, it is a directory
    // of what exists and who touched it — the oracle 2.3.7 refuses to be.
    await expect(controller.recent(50, RESIDENT)).rejects.toThrow(/not authorised/);
    await expect(controller.recent(50, CREW)).rejects.toThrow(/not authorised/);
  });

  it('A12 — a work order history is its own, not the whole trail filtered by eye', async () => {
    const { controller, workOrderId } = await readable();
    const history = await controller.history('WorkOrder', workOrderId, 50, MANAGER);

    expect(history.length).toBeGreaterThan(0);
    expect(history.every((e) => e.targetId === workOrderId)).toBe(true);
    expect(history.every((e) => e.targetEntity === 'WorkOrder')).toBe(true);
    // 8.3.x — the assignment and the acceptance are both there, which is the pair a review of a
    // dispatch decision actually asks about.
    expect(history.some((e) => e.action.includes('assign'))).toBe(true);
    expect(history.some((e) => e.action.includes('Accepted'))).toBe(true);
  });

  it('A13 — the filter runs before the limit, so an old entity still has a history', async () => {
    const { controller, audit, workOrderId } = await readable();
    // Fifty unrelated events after the ones under test. Taking the last N rows and *then*
    // filtering would answer "nothing ever happened to this work order" — the failure mode is
    // silent, and it gets worse the longer the system runs.
    for (let i = 0; i < 50; i += 1) {
      await audit.appendAction('manager-1', 'noise', 'Cluster', `cluster-${i}`);
    }

    const history = await controller.history('WorkOrder', workOrderId, 5, MANAGER);
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((e) => e.targetId === workOrderId)).toBe(true);
  });

  it('A14 — an entity nothing has happened to is an empty list, not an error', async () => {
    const { controller } = await readable();
    // "Nothing has happened yet" and "there is no such thing" are different facts, and only the
    // first is this endpoint's to answer. A 404 here would make the trail an existence oracle.
    expect(await controller.history('WorkOrder', 'never-existed', 50, MANAGER)).toEqual([]);
  });

  it('A15 — a refusal is flagged as one rather than left as a string convention', async () => {
    const { controller, f } = await readable();
    await expect(f.moderation.verify('no-such-report', RESIDENT)).rejects.toThrow(/not authorised/);

    const refusal = (await controller.recent(50, MANAGER)).find((e) => e.refused);
    expect(refusal).toBeDefined();
    // The `DENIED:` prefix is lifted into a boolean here: a screen that discovers the convention
    // by string-matching gets it wrong the day an action name legitimately contains the word.
    expect(refusal?.action.startsWith('DENIED:')).toBe(false);
    expect(refusal?.action).toBe('report:moderate');
  });

  it('A16 — the limit is bounded, so the whole growing table cannot be asked for', async () => {
    const { controller, audit } = await readable();
    for (let i = 0; i < 20; i += 1) {
      await audit.appendAction('manager-1', 'noise', 'Cluster', `cluster-${i}`);
    }

    expect((await controller.recent(3, MANAGER)).length).toBe(3);
    // Absent, negative and absurd all land on a sane number rather than on the table's size.
    expect((await controller.recent(undefined, MANAGER)).length).toBeLessThanOrEqual(100);
    expect((await controller.recent(-5, MANAGER)).length).toBeLessThanOrEqual(100);
    expect((await controller.recent(10_000_000, MANAGER)).length).toBeLessThanOrEqual(500);
  });

  it('A17 — reading the trail is itself refused-and-logged when it should not have happened', async () => {
    const { controller, audit } = await readable();
    await expect(controller.recent(50, RESIDENT)).rejects.toThrow(/not authorised/);

    const denial = (await audit.recent(200)).find((e) => e.action === 'DENIED:audit:read');
    // 2.3.8 applies to this route like every other, and it is the route where a quiet refusal
    // would matter most: someone probing the trail is exactly what the trail is for.
    expect(denial?.accountId).toBe('resident-1');
  });
});

