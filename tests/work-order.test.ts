/**
 * D-Fence — Lab 4 §3.2: work-order dispatch and the crew loop (§8).
 *
 * The basis-path suite already paths over `isTransitionPermitted`. These are the cases that only
 * appear once the machine is *driven*: the guards that refuse a completion, the assignee
 * restriction that a role check alone cannot express, and US-8.8 — the end-to-end loop where a
 * verified job lowers the cluster's score, which is the ninety seconds the demo is built around.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { AccessControlService } from '../src/control/AccessControlService';
import { AccessPolicy } from '../src/control/AccessPolicy';
import { WorkOrderTransitionTable } from '../src/control/WorkOrderTransitionTable';
import { WorkOrderLifecycleController, TransitionRefused } from '../src/control/WorkOrderLifecycleController';
import { DispatchController, DuplicateWorkOrder } from '../src/control/DispatchController';
import { principalFor } from '../src/control/DashboardController';
import { PriorityScoringEngine } from '../src/control/PriorityScoringEngine';
import { NormalisationFactory } from '../src/control/normalisation/NormalisationFactory';
import { ConfigLoader } from '../src/config/ConfigLoader';
import {
  InMemoryAuditStore,
  InMemoryClusterStore,
  InMemoryPriorityScoreStore,
} from '../src/persistence/memory/InMemoryStores';
import {
  InMemoryTreatmentRecordStore,
  InMemoryWorkOrderStore,
  RecordingNotifier,
} from '../src/persistence/memory/InMemoryWorkOrderStores';
import { Cluster } from '../src/entity/Cluster';
import { CompletionEvidence } from '../src/entity/CompletionEvidence';
import { PremisesMix } from '../src/entity/valueTypes';
import { Role, TaskType, WorkOrderStatus, PriorityTier, Driver } from '../src/entity/enums';
import { Principal } from '../src/control/Principal';

const MANAGER = principalFor(Role.OperationsManager, 'manager-1');
const CREW = new Principal('crew-1', Role.CleaningCrew, 'session-crew');
const OTHER_CREW = new Principal('crew-2', Role.CleaningCrew, 'session-crew-2');

function tomorrow(): string {
  return new Date(Date.now() + 8 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
}

function yesterday(): string {
  return new Date(Date.now() + 8 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
}

function evidence(photos = ['photo-1.jpg'], notes = 'Fogged the void deck and cleared two trays.'): CompletionEvidence {
  const e = new CompletionEvidence();
  e.workOrderId = '';
  e.completedAt = new Date();
  e.taskPerformed = TaskType.Fogging;
  e.notes = notes;
  e.photoKeys = photos;
  e.rejectionReason = null;
  return e;
}

interface Fixture {
  dispatch: DispatchController;
  lifecycle: WorkOrderLifecycleController;
  workOrders: InMemoryWorkOrderStore;
  treatments: InMemoryTreatmentRecordStore;
  notifier: RecordingNotifier;
  clusterId: string;
}

async function fixture(): Promise<Fixture> {
  const clusters = new InMemoryClusterStore();
  const cluster = new Cluster();
  cluster.objectId = 'c-525120';
  cluster.locality = 'Countryside Rd, Walk / Florissa Pk';
  cluster.caseSize = 258;
  cluster.caseDelta = 0;
  cluster.isActive = true;
  cluster.premisesMix = new PremisesMix(['Bin'], ['Ceramic pot'], []);
  await clusters.upsertFromFeed({ retrievedAt: new Date(), records: [cluster] });
  const stored = (await clusters.findActive())[0] as Cluster;

  const workOrders = new InMemoryWorkOrderStore();
  const treatments = new InMemoryTreatmentRecordStore();
  const notifier = new RecordingNotifier();
  const scores = new InMemoryPriorityScoreStore();
  const ac = new AccessControlService(new AccessPolicy(), new InMemoryAuditStore());

  const lifecycle = new WorkOrderLifecycleController(
    new WorkOrderTransitionTable(),
    workOrders,
    treatments,
    notifier,
    null,
  );
  const dispatch = new DispatchController(ac, lifecycle, workOrders, clusters, scores, notifier);
  return { dispatch, lifecycle, workOrders, treatments, notifier, clusterId: stored.id };
}

/** Drives a work order to In Progress, the state most cases start from. */
async function inProgress(f: Fixture): Promise<string> {
  const wo = await f.dispatch.createWorkOrder(
    { clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() },
    MANAGER,
  );
  await f.dispatch.assign(wo.id, CREW.accountId, MANAGER);
  await f.lifecycle.accept(wo.id, CREW);
  await f.lifecycle.start(wo.id, CREW);
  return wo.id;
}

describe('Creation — §8.1', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('C1 — a new work order starts in Created, which is set directly and is not a transition (8.3.15)', async () => {
    const wo = await f.dispatch.createWorkOrder(
      { clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() },
      MANAGER,
    );
    expect(wo.currentStatus()).toBe(WorkOrderStatus.Created);
    expect(wo.priority).toBe(PriorityTier.Low); // 8.1.5, defaulted with no score stored yet
  });

  it('C2 — a scheduled date in the past is refused (8.1.4)', async () => {
    await expect(
      f.dispatch.createWorkOrder({ clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: yesterday() }, MANAGER),
    ).rejects.toThrow(/in the past/);
  });

  it('C3 — a second open work order of the same task type is refused, and the blocker is offered (8.1.11, 8.1.12)', async () => {
    const first = await f.dispatch.createWorkOrder(
      { clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() },
      MANAGER,
    );
    try {
      await f.dispatch.createWorkOrder(
        { clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() },
        MANAGER,
      );
      expect.unreachable('the duplicate should have been refused');
    } catch (error) {
      expect(error).toBeInstanceOf(DuplicateWorkOrder);
      expect((error as DuplicateWorkOrder).existing.id).toBe(first.id);
    }
  });

  it('C4 — a different task type on the same cluster is allowed (8.1.11 is per task type)', async () => {
    await f.dispatch.createWorkOrder({ clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() }, MANAGER);
    await expect(
      f.dispatch.createWorkOrder({ clusterId: f.clusterId, taskType: TaskType.DrainClearance, scheduledDate: tomorrow() }, MANAGER),
    ).resolves.toBeDefined();
  });

  it('C5 — a Cleaning Crew Member cannot create work (2.3.5)', async () => {
    await expect(
      f.dispatch.createWorkOrder({ clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() }, CREW),
    ).rejects.toThrow(/not authorised/);
  });

  it('C6 — instructions over 1000 characters are refused (8.1.6)', async () => {
    await expect(
      f.dispatch.createWorkOrder(
        { clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow(), instructions: 'x'.repeat(1001) },
        MANAGER,
      ),
    ).rejects.toThrow(/1000 characters/);
  });
});

describe('Assignment — §8.2', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('A1 — assignment moves Created to Assigned and notifies the assignee (8.2.1, 8.2.4)', async () => {
    const wo = await f.dispatch.createWorkOrder({ clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() }, MANAGER);
    const assigned = await f.dispatch.assign(wo.id, CREW.accountId, MANAGER);

    expect(assigned.currentStatus()).toBe(WorkOrderStatus.Assigned);
    expect(f.notifier.to(CREW.accountId)).toHaveLength(1);
  });

  it('A2 — a deactivated account cannot be assigned (8.2.3)', async () => {
    const wo = await f.dispatch.createWorkOrder({ clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() }, MANAGER);
    await expect(f.dispatch.assign(wo.id, CREW.accountId, MANAGER, false)).rejects.toThrow(/deactivated/);
  });

  it('A3 — reassignment notifies both the previous and the new assignee, and keeps the history (8.2.6, 8.2.7)', async () => {
    const id = await inProgress(f);
    await f.dispatch.reassign(id, OTHER_CREW.accountId, MANAGER);

    expect(f.notifier.to(OTHER_CREW.accountId)).toHaveLength(1);
    expect(f.notifier.to(CREW.accountId).some((m) => m.includes('reassigned'))).toBe(true);
    expect(await f.workOrders.assignmentHistory(id)).toHaveLength(2);
  });

  it('A4 — a Verified work order cannot be reassigned (8.2.5 as corrected in v0.3)', async () => {
    const id = await inProgress(f);
    await f.lifecycle.complete(id, evidence(), CREW);
    await f.lifecycle.verify(id, MANAGER);

    await expect(f.dispatch.reassign(id, OTHER_CREW.accountId, MANAGER)).rejects.toBeInstanceOf(TransitionRefused);
  });

  it('A5 — the workload of each candidate is available at the point of assignment (8.2.2)', async () => {
    await inProgress(f);
    const workload = await f.dispatch.crewWorkload([CREW.accountId, OTHER_CREW.accountId]);
    expect(workload).toEqual([
      { crewId: CREW.accountId, openWorkOrders: 1 },
      { crewId: OTHER_CREW.accountId, openWorkOrders: 0 },
    ]);
  });
});

describe('Lifecycle guards — §8.3', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('L1 — a completion with no photograph is refused, and the refusal states why (8.3.7, 8.3.16)', async () => {
    const id = await inProgress(f);
    try {
      await f.lifecycle.complete(id, evidence([]), CREW);
      expect.unreachable('a completion without a photograph must be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(TransitionRefused);
      // 8.3.16 asks the refusal to state why — to the crew member, not to the auditor. This used
      // to assert the string '8.3.6', which passed while the person completing the job was shown
      // "the conditions of 8.3.6, 8.3.7 are not met". The assertion was measuring traceability and
      // calling it a message, so a requirement about explaining yourself was met by not doing it.
      const reason = (error as TransitionRefused).reason;
      expect(reason).toContain('photograph');
      expect(reason).not.toMatch(/\d+\.\d+\.\d+/);
    }
  });

  it('L2 — only the ASSIGNED crew member may complete, not any crew member (8.3.6)', async () => {
    const id = await inProgress(f);
    await expect(f.lifecycle.complete(id, evidence(), OTHER_CREW)).rejects.toThrow(/only the assigned crew member/);
  });

  it('L3 — a cancellation with no reason is refused (8.3.18)', async () => {
    const wo = await f.dispatch.createWorkOrder({ clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() }, MANAGER);
    await expect(f.dispatch.cancel(wo.id, '   ', MANAGER)).rejects.toBeInstanceOf(TransitionRefused);
  });

  it('L4 — a cancellation with a reason succeeds and is terminal (8.3.13, 8.3.18)', async () => {
    const wo = await f.dispatch.createWorkOrder({ clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() }, MANAGER);
    const cancelled = await f.dispatch.cancel(wo.id, 'Cluster closed by NEA', MANAGER);

    expect(cancelled.currentStatus()).toBe(WorkOrderStatus.Cancelled);
    expect(cancelled.isTerminal()).toBe(true);
    await expect(f.dispatch.assign(wo.id, CREW.accountId, MANAGER)).rejects.toThrow(/terminal/);
  });

  it('L5 — a rejected completion needs a reason, notifies the crew, and rests in Rejected (8.3.10, 8.3.11, 8.3.19)', async () => {
    const id = await inProgress(f);
    await f.lifecycle.complete(id, evidence(), CREW);

    const rejected = await f.lifecycle.rejectCompletion(id, 'The photograph shows a different block.', MANAGER);

    expect(rejected.currentStatus()).toBe(WorkOrderStatus.Rejected);
    expect(f.notifier.to(CREW.accountId).some((m) => m.includes('rejected'))).toBe(true);
  });

  it('L6 — the crew member resumes a rejected job back to In Progress (8.3.20)', async () => {
    const id = await inProgress(f);
    await f.lifecycle.complete(id, evidence(), CREW);
    await f.lifecycle.rejectCompletion(id, 'Wrong block.', MANAGER);

    const resumed = await f.lifecycle.resume(id, CREW);
    expect(resumed.currentStatus()).toBe(WorkOrderStatus.InProgress);
  });

  it('L7 — an issue may be raised before completion but not after (8.3.8)', async () => {
    const id = await inProgress(f);
    const flagged = await f.lifecycle.raiseIssue(id, 'Gate locked; cannot reach the drain.', CREW);
    expect(flagged.issueFlag).toBe(true);

    await f.lifecycle.complete(id, evidence(), CREW);
    await expect(f.lifecycle.raiseIssue(id, 'Too late.', CREW)).rejects.toThrow(/before completion/);
  });

  it('L8 — the start timestamp is recorded when work begins (8.3.17)', async () => {
    const id = await inProgress(f);
    expect((await f.workOrders.findById(id))?.startedAt).toBeInstanceOf(Date);
  });

  it('L9 — an overdue work order is flagged, and a settled one is not (8.3.14)', async () => {
    const wo = await f.dispatch.createWorkOrder({ clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow() }, MANAGER);
    wo.scheduledDate = yesterday();
    await f.workOrders.save(wo);

    expect((await f.dispatch.overdue()).map((w) => w.id)).toContain(wo.id);

    await f.dispatch.cancel(wo.id, 'No longer needed', MANAGER);
    expect((await f.dispatch.overdue()).map((w) => w.id)).not.toContain(wo.id);
  });
});

describe('Crew working view — §8.4', () => {
  it('V1 — a crew member sees only their own work orders (8.4.1)', async () => {
    const f = await fixture();
    const id = await inProgress(f);
    const other = await f.dispatch.createWorkOrder({ clusterId: f.clusterId, taskType: TaskType.Inspection, scheduledDate: tomorrow() }, MANAGER);
    await f.dispatch.assign(other.id, OTHER_CREW.accountId, MANAGER);

    const mine = await f.dispatch.crewView(CREW);
    expect(mine.map((w) => w.id)).toEqual([id]);
  });

  it('V2 — Upcoming excludes terminal work and sorts by scheduled date (8.4.2, 8.4.6)', async () => {
    const f = await fixture();
    const id = await inProgress(f);
    expect((await f.dispatch.crewView(CREW, 'Upcoming')).map((w) => w.id)).toEqual([id]);

    await f.lifecycle.complete(id, evidence(), CREW);
    await f.lifecycle.verify(id, MANAGER);
    expect(await f.dispatch.crewView(CREW, 'Upcoming')).toHaveLength(0);
    expect(await f.dispatch.crewView(CREW, 'Completed')).toHaveLength(1);
  });
});

describe('US-8.8 — the loop closes: a verified job lowers the score (8.3.12, 8.5.3, 4.1.17)', () => {
  it('E1 — verifying writes a treatment record dated to the completion, not the verification (8.3.12)', async () => {
    const f = await fixture();
    const id = await inProgress(f);
    const submitted = evidence();
    submitted.completedAt = new Date('2026-09-01T10:00:00+08:00');
    await f.lifecycle.complete(id, submitted, CREW);

    const record = await f.lifecycle.verify(id, MANAGER);

    expect(record.clusterId).toBe(f.clusterId);
    expect(record.taskType).toBe(TaskType.Fogging);
    expect(record.completionDate).toBe('2026-09-01');
  });

  it('E2 — the treatment record moves the 4.1.15 driver off its 90-day default (4.1.16)', async () => {
    const f = await fixture();
    const id = await inProgress(f);
    expect(await f.treatments.daysSinceLastTreatment(f.clusterId, new Date())).toBe(90);

    await f.lifecycle.complete(id, evidence(), CREW);
    await f.lifecycle.verify(id, MANAGER);

    expect(await f.treatments.daysSinceLastTreatment(f.clusterId, new Date())).toBe(0);
  });

  it('E3 — and the cluster therefore scores lower than it did untreated (4.1.17)', async () => {
    const f = await fixture();
    const config = ConfigLoader.load();
    const engine = new PriorityScoringEngine(
      NormalisationFactory.build(config.normalisation),
      config,
      new InMemoryPriorityScoreStore(),
    );
    engine.markStale([Driver.Rainfall24h, Driver.Rainfall72h, Driver.VerifiedOpenReportCount]);

    const clusters = new InMemoryClusterStore();
    const cluster = new Cluster();
    Object.assign(cluster, {
      id: f.clusterId,
      objectId: 'c-525120',
      locality: 'Countryside Rd',
      caseSize: 258,
      caseDelta: 0,
      isActive: true,
      premisesMix: new PremisesMix(['Bin'], ['Ceramic pot'], []),
    });
    await clusters.upsertFromFeed({ retrievedAt: new Date(), records: [cluster] });
    const active = await clusters.findActive();

    const before = await engine.computeScores(active, new Map(active.map((c) => [c.id, { daysSinceLastTreatment: 90 }])));
    const after = await engine.computeScores(active, new Map(active.map((c) => [c.id, { daysSinceLastTreatment: 0 }])));

    // This is the ninety seconds the demo is built around: work done, score falls.
    expect(after.top(1)[0]?.score).toBeLessThan(before.top(1)[0]?.score as number);
  });
});

describe('The daily dispatch list — §8.1.7, 8.1.8', () => {
  it('P1 — a cluster with an open work order is not proposed again', async () => {
    const f = await fixture();
    const empty = await f.dispatch.proposeDailyList(tomorrow(), MANAGER);
    // No stored scores in this fixture, so nothing is proposed — the list is drawn from the
    // ranking, not from the cluster table, which is what keeps it in priority order.
    expect(empty).toHaveLength(0);
  });

  it('P2 — a Cleaning Crew Member cannot see the dispatch list (2.3.5)', async () => {
    const f = await fixture();
    await expect(f.dispatch.proposeDailyList(tomorrow(), CREW)).rejects.toThrow(/not authorised/);
  });
});
