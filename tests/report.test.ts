/**
 * D-Fence — Lab 4 §3.2: community reporting (§5).
 *
 * Three groups of cases carry most of the weight here:
 *
 *  - **Boundary values on 5.1.11.** Fifty metres and twenty-four hours are the two judgement
 *    numbers flagged in REQUIREMENTS §13, and the cases at 49/50/51 m and 23/25 h pin down what
 *    the code actually does at the edge rather than what the prose seems to say.
 *  - **5.2.5 — what reaches the score.** The community driver is the only path by which a member
 *    of the public can move an operational decision, so the tests state exactly which statuses
 *    count.
 *  - **The §8 join.** 5.2.6, 5.2.7/8.5.1/8.5.2 and 8.3.21 were `TODO(E5)` hooks in the work-order
 *    controllers. These drive them through a real work order.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { AccessControlService, NotAuthorised } from '../src/control/AccessControlService';
import { AccessPolicy } from '../src/control/AccessPolicy';
import { ReportController, DuplicateReport, ReportRejected } from '../src/control/ReportController';
import { ModerationController } from '../src/control/ModerationController';
import { ReportLifecycleController, ReportTransitionRefused } from '../src/control/ReportLifecycleController';
import { ReportTransitionTable } from '../src/control/ReportTransitionTable';
import { WorkOrderTransitionTable } from '../src/control/WorkOrderTransitionTable';
import { WorkOrderLifecycleController } from '../src/control/WorkOrderLifecycleController';
import { DispatchController } from '../src/control/DispatchController';
import { DashboardController, principalFor } from '../src/control/DashboardController';
import {
  InMemoryAuditStore,
  InMemoryClusterStore,
  InMemoryIngestionRunStore,
  InMemoryPriorityScoreStore,
} from '../src/persistence/memory/InMemoryStores';
import { InMemoryClusterLocator, InMemoryReportStore } from '../src/persistence/memory/InMemoryReportStores';
import {
  InMemoryTreatmentRecordStore,
  InMemoryWorkOrderStore,
  RecordingNotifier,
} from '../src/persistence/memory/InMemoryWorkOrderStores';
import { Cluster } from '../src/entity/Cluster';
import { CompletionEvidence } from '../src/entity/CompletionEvidence';
import { Report, UNASSIGNED_LOCALITY } from '../src/entity/Report';
import { GeoPoint, Polygon, PremisesMix } from '../src/entity/valueTypes';
import { PhotoUpload } from '../src/entity/ReportPhoto';
import { ReportStatus, ReportType, Role, TaskType } from '../src/entity/enums';
import { Principal } from '../src/control/Principal';

const MANAGER = principalFor(Role.OperationsManager, 'manager-1');
const RESIDENT = new Principal('resident-1', Role.Resident, 'session-r1');
const NEIGHBOUR = new Principal('resident-2', Role.Resident, 'session-r2');
const THIRD = new Principal('resident-3', Role.Resident, 'session-r3');
const CREW = new Principal('crew-1', Role.CleaningCrew, 'session-crew');

/** Inside the cluster boundary below. Roughly Woodlands. */
const INSIDE = new GeoPoint(1.4300, 103.7900);
/** ~600 m from the boundary's centroid: outside it, inside the 1 km fallback of 5.1.8. */
const NEAR = new GeoPoint(1.4360, 103.7900);
/** Well over a kilometre from anything: 5.1.9's Unassigned. */
const FAR = new GeoPoint(1.3000, 103.8500);

/** A point `metres` due north of `from`. One degree of latitude is ~111.32 km. */
function northOf(from: GeoPoint, metres: number): GeoPoint {
  return new GeoPoint(from.latitude + metres / 111_320, from.longitude);
}

function photo(overrides: Partial<PhotoUpload> = {}): PhotoUpload {
  return {
    filename: 'drain.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 1_000_000,
    storageKey: `reports/${Math.random().toString(36).slice(2)}.jpg`,
    ...overrides,
  };
}

interface Fixture {
  reports: InMemoryReportStore;
  controller: ReportController;
  moderation: ModerationController;
  lifecycle: ReportLifecycleController;
  dispatch: DispatchController;
  workOrders: WorkOrderLifecycleController;
  notifier: RecordingNotifier;
  dashboard: DashboardController;
  clusterId: string;
  locality: string;
}

async function fixture(): Promise<Fixture> {
  const clusters = new InMemoryClusterStore();
  const cluster = new Cluster();
  cluster.objectId = 'c-525120';
  cluster.locality = 'Marsiling Rise';
  cluster.caseSize = 12;
  cluster.caseDelta = 0;
  cluster.isActive = true;
  cluster.premisesMix = new PremisesMix(['Bin'], [], []);
  // A ~0.006° square (roughly 660 m) with INSIDE at its centre and NEAR just outside the north edge.
  cluster.boundary = new Polygon([
    [
      new GeoPoint(1.4270, 103.7870),
      new GeoPoint(1.4330, 103.7870),
      new GeoPoint(1.4330, 103.7930),
      new GeoPoint(1.4270, 103.7930),
      new GeoPoint(1.4270, 103.7870),
    ],
  ]);
  await clusters.upsertFromFeed({ retrievedAt: new Date(), records: [cluster] });
  const stored = (await clusters.findActive())[0] as Cluster;

  const reports = new InMemoryReportStore();
  const notifier = new RecordingNotifier();
  const ac = new AccessControlService(new AccessPolicy(), new InMemoryAuditStore());
  const lifecycle = new ReportLifecycleController(new ReportTransitionTable(), reports, notifier);
  const controller = new ReportController(ac, reports, new InMemoryClusterLocator(clusters), lifecycle);
  const moderation = new ModerationController(ac, reports, lifecycle);

  const workOrderStore = new InMemoryWorkOrderStore();
  const scores = new InMemoryPriorityScoreStore();
  const workOrders = new WorkOrderLifecycleController(
    new WorkOrderTransitionTable(),
    workOrderStore,
    new InMemoryTreatmentRecordStore(),
    notifier,
    null,
    lifecycle, // 5.2.7, 8.5.1, 8.5.2
  );
  const dispatch = new DispatchController(ac, workOrders, workOrderStore, clusters, scores, notifier, lifecycle);
  const dashboard = new DashboardController(ac, clusters, scores, new InMemoryIngestionRunStore(), workOrderStore, reports);

  return {
    reports,
    controller,
    moderation,
    lifecycle,
    dispatch,
    workOrders,
    notifier,
    dashboard,
    clusterId: stored.id,
    locality: stored.locality,
  };
}

/** A submitted report at `point`, defaulting to inside the cluster. */
async function submit(
  f: Fixture,
  point = INSIDE,
  by = RESIDENT,
  type = ReportType.StandingWater,
  now = new Date(),
): Promise<Report> {
  return f.controller.submitReport({ point, type, description: 'Standing water in a disused tray.' }, by, now);
}

/** A verified report — the state from which 5.2.5 and the §8 hooks become interesting. */
async function verified(f: Fixture, point = INSIDE): Promise<Report> {
  const report = await submit(f, point);
  return f.moderation.verify(report.id, MANAGER);
}

function tomorrow(): string {
  return new Date(Date.now() + 8 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
}

describe('Submission — §5.1.1 to §5.1.6', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('S1 — a valid report is stored as Submitted with the reporter and timestamp (5.1.10, 5.2.2)', async () => {
    const at = new Date('2026-09-03T10:00:00+08:00');
    const report = await submit(f, INSIDE, RESIDENT, ReportType.StandingWater, at);
    expect(report.currentStatus()).toBe(ReportStatus.Submitted);
    expect(report.reporterId).toBe('resident-1');
    expect(report.submittedAt).toEqual(at);
    expect(report.corroborationCount).toBe(0);
  });

  it('S2 — the initial status is recorded in the history, so 8.3.21 has something to restore to', async () => {
    const report = await submit(f);
    const history = await f.reports.statusHistory(report.id);
    expect(history).toEqual([expect.objectContaining({ from: null, to: ReportStatus.Submitted })]);
  });

  it('S3 — a description of exactly 500 characters is accepted, 501 is refused (5.1.4, boundary)', async () => {
    const at = new Date();
    await expect(
      f.controller.submitReport({ point: INSIDE, type: ReportType.BlockedDrain, description: 'x'.repeat(500) }, RESIDENT, at),
    ).resolves.toBeInstanceOf(Report);
    await expect(
      f.controller.submitReport({ point: FAR, type: ReportType.BlockedDrain, description: 'x'.repeat(501) }, RESIDENT, at),
    ).rejects.toBeInstanceOf(ReportRejected);
  });

  it('S4 — three photographs are accepted and a fourth is refused (5.1.5, boundary)', async () => {
    const three = [photo(), photo(), photo()];
    const report = await f.controller.submitReport(
      { point: INSIDE, type: ReportType.StandingWater, description: 'tray', photos: three },
      RESIDENT,
    );
    expect(await f.reports.photosFor(report.id)).toHaveLength(3);
    await expect(
      f.controller.submitReport(
        { point: FAR, type: ReportType.StandingWater, description: 'tray', photos: [...three, photo()] },
        RESIDENT,
      ),
    ).rejects.toThrow(/at most three/);
  });

  it('S5 — a photograph over 5 MB or of the wrong format is refused (5.1.6, boundary)', async () => {
    const cases: Array<[PhotoUpload, RegExp]> = [
      [photo({ sizeBytes: 5 * 1024 * 1024 + 1 }), /5 MB/],
      [photo({ contentType: 'image/gif', filename: 'x.gif' }), /JPEG and PNG/],
    ];
    for (const [upload, message] of cases) {
      await expect(
        f.controller.submitReport({ point: FAR, type: ReportType.Other, description: 'x', photos: [upload] }, RESIDENT),
      ).rejects.toThrow(message);
    }
    // Exactly 5 MB, and PNG, are both fine — the limit is "larger than", not "at least".
    await expect(
      f.controller.submitReport(
        {
          point: INSIDE,
          type: ReportType.Other,
          description: 'x',
          photos: [photo({ sizeBytes: 5 * 1024 * 1024, contentType: 'image/png' })],
        },
        RESIDENT,
      ),
    ).resolves.toBeInstanceOf(Report);
  });

  it('S6 — a type outside the five is refused rather than coerced to Other (5.1.3)', async () => {
    await expect(
      f.controller.submitReport(
        { point: INSIDE, type: 'Mosquitoes' as ReportType, description: 'lots of them' },
        RESIDENT,
      ),
    ).rejects.toThrow(/not one of the five/);
  });

  it('S7 — a crew member has no report:create permission, so submission is refused (2.3.5)', async () => {
    await expect(submit(f, INSIDE, CREW)).rejects.toBeInstanceOf(NotAuthorised);
  });
});

describe('Location binding — §5.1.7 to §5.1.9', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('L1 — a point inside an active cluster binds to that cluster (5.1.7)', async () => {
    const report = await submit(f, INSIDE);
    expect(report.clusterId).toBe(f.clusterId);
    expect(report.localityBinding).toBe(f.locality);
  });

  it('L2 — a point outside every cluster but within 1 km takes the locality, NOT the cluster (5.1.8)', async () => {
    const report = await submit(f, NEAR);
    // The distinction that matters: this report must not enter 4.1.3's count for a cluster whose
    // boundary it is outside, so the locality is bound and the cluster id stays null.
    expect(report.clusterId).toBeNull();
    expect(report.localityBinding).toBe(f.locality);
  });

  it('L3 — a point with no locality within 1 km is Unassigned, and its status is still Submitted (5.1.9)', async () => {
    const report = await submit(f, FAR);
    expect(report.localityBinding).toBe(UNASSIGNED_LOCALITY);
    expect(report.clusterId).toBeNull();
    expect(report.currentStatus()).toBe(ReportStatus.Submitted); // Unassigned is a binding, not a status
  });
});

describe('Duplicates and corroboration — §5.1.11 to §5.1.14', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('D1 — 49 m away and same type is a duplicate; 51 m is not (5.1.11, boundary)', async () => {
    const first = await submit(f);
    await expect(submit(f, northOf(INSIDE, 49), NEIGHBOUR)).rejects.toBeInstanceOf(DuplicateReport);
    await expect(submit(f, northOf(INSIDE, 51), NEIGHBOUR)).resolves.toBeInstanceOf(Report);
    expect(first.corroborationCount).toBe(0); // refusing is not confirming
  });

  it('D2 — exactly 50 m is a duplicate: the radius is inclusive (5.1.11, boundary)', async () => {
    await submit(f);
    // Stated as a decision rather than left to the reader: "within 50 metres" includes 50.
    await expect(submit(f, northOf(INSIDE, 50), NEIGHBOUR)).rejects.toBeInstanceOf(DuplicateReport);
  });

  it('D3 — 23 hours old is a duplicate; 25 hours old is not (5.1.11, boundary)', async () => {
    const now = new Date('2026-09-03T12:00:00+08:00');
    const at23 = new Date(now.getTime() - 23 * 3_600_000);
    const at25 = new Date(now.getTime() - 25 * 3_600_000);

    const recent = await fixture();
    await submit(recent, INSIDE, RESIDENT, ReportType.StandingWater, at23);
    await expect(submit(recent, INSIDE, NEIGHBOUR, ReportType.StandingWater, now)).rejects.toBeInstanceOf(DuplicateReport);

    const stale = await fixture();
    await submit(stale, INSIDE, RESIDENT, ReportType.StandingWater, at25);
    await expect(submit(stale, INSIDE, NEIGHBOUR, ReportType.StandingWater, now)).resolves.toBeInstanceOf(Report);
  });

  it('D4 — a different type at the same spot is not a duplicate (5.1.11)', async () => {
    await submit(f, INSIDE, RESIDENT, ReportType.StandingWater);
    await expect(submit(f, INSIDE, NEIGHBOUR, ReportType.BlockedDrain)).resolves.toBeInstanceOf(Report);
  });

  it('D5 — a rejected report is settled, so the same spot may be reported again (5.1.11)', async () => {
    const first = await submit(f);
    await f.moderation.reject(first.id, 'Photograph shows a covered drain, no standing water.', MANAGER);
    await expect(submit(f, INSIDE, NEIGHBOUR)).resolves.toBeInstanceOf(Report);
  });

  it('D6 — the refusal carries the existing report, which is what 5.1.12 offers to confirm', async () => {
    const first = await submit(f);
    const error = await submit(f, northOf(INSIDE, 10), NEIGHBOUR).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DuplicateReport);
    expect((error as DuplicateReport).existing.id).toBe(first.id);
  });

  it('D7 — confirming increments the count, once per resident (5.1.13, 5.1.14)', async () => {
    const report = await submit(f);
    await f.controller.confirmExisting(report.id, NEIGHBOUR);
    expect((await f.reports.findById(report.id))?.corroborationCount).toBe(1);

    await expect(f.controller.confirmExisting(report.id, NEIGHBOUR)).rejects.toThrow(/already confirmed/);
    expect((await f.reports.findById(report.id))?.corroborationCount).toBe(1);

    await f.controller.confirmExisting(report.id, THIRD);
    expect((await f.reports.findById(report.id))?.corroborationCount).toBe(2);
  });

  it('D8 — a reporter cannot corroborate their own report', async () => {
    const report = await submit(f);
    await expect(f.controller.confirmExisting(report.id, RESIDENT)).rejects.toThrow(/your own report/);
  });

  it('D9 — a settled report cannot be confirmed (5.1.13)', async () => {
    const report = await submit(f);
    await f.moderation.reject(report.id, 'Duplicate of an earlier clearance.', MANAGER);
    await expect(f.controller.confirmExisting(report.id, NEIGHBOUR)).rejects.toThrow(/already settled/);
  });
});

describe('Moderation — §5.2.3, §5.2.4, §5.3', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('M1 — the queue holds Submitted reports oldest first (5.3.1, 5.3.2)', async () => {
    const older = await submit(f, INSIDE, RESIDENT, ReportType.StandingWater, new Date('2026-09-01T08:00:00+08:00'));
    const newer = await submit(f, FAR, NEIGHBOUR, ReportType.BlockedDrain, new Date('2026-09-02T08:00:00+08:00'));
    const rows = await f.moderation.listQueue(MANAGER);
    expect(rows.map((r) => r.reportId)).toEqual([older.id, newer.id]);
  });

  it('M2 — the queue filters by cluster and by type, server-side (5.3.3)', async () => {
    const inCluster = await submit(f, INSIDE, RESIDENT, ReportType.StandingWater);
    await submit(f, FAR, NEIGHBOUR, ReportType.BlockedDrain);
    expect((await f.moderation.listQueue(MANAGER, { clusterId: f.clusterId })).map((r) => r.reportId)).toEqual([inCluster.id]);
    expect((await f.moderation.listQueue(MANAGER, { type: ReportType.BlockedDrain })).map((r) => r.reportId)).toHaveLength(1);
  });

  it('M3 — a verified report records the moderator and the timestamp (5.3.4)', async () => {
    const report = await f.moderation.verify((await submit(f)).id, MANAGER);
    expect(report.currentStatus()).toBe(ReportStatus.Verified);
    expect(report.moderatorId).toBe('manager-1');
    expect(report.moderatedAt).toBeInstanceOf(Date);
  });

  it('M4 — a rejection reason under ten characters is refused; ten is accepted (5.2.4, boundary)', async () => {
    const report = await submit(f);
    await expect(f.moderation.reject(report.id, 'no water', MANAGER)).rejects.toBeInstanceOf(ReportTransitionRefused);
    // Refused *before* writing: the status is untouched, which is the property that matters.
    expect((await f.reports.findById(report.id))?.currentStatus()).toBe(ReportStatus.Submitted);
    await expect(f.moderation.reject(report.id, '0123456789', MANAGER)).resolves.toBeInstanceOf(Report);
  });

  it('M5 — a Resident may not moderate (5.2.3, 2.3.2)', async () => {
    const report = await submit(f);
    await expect(f.moderation.verify(report.id, NEIGHBOUR)).rejects.toBeInstanceOf(NotAuthorised);
    await expect(f.moderation.listQueue(NEIGHBOUR)).rejects.toBeInstanceOf(NotAuthorised);
  });

  it('M6 — a settled report has no outgoing move, and the refusal says so (5.2.1)', async () => {
    const report = await submit(f);
    await f.moderation.reject(report.id, 'Photograph shows no standing water.', MANAGER);
    await expect(f.moderation.verify(report.id, MANAGER)).rejects.toThrow(/settled status/);
  });
});

describe('What reaches the score — §5.2.5 into §4.1.3', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('C1 — a Submitted report does not count; verifying it makes it count (5.2.5)', async () => {
    const report = await submit(f);
    expect(await f.moderation.verifiedOpenCounts([f.clusterId])).toEqual(new Map([[f.clusterId, 0]]));
    await f.moderation.verify(report.id, MANAGER);
    expect(await f.moderation.verifiedOpenCounts([f.clusterId])).toEqual(new Map([[f.clusterId, 1]]));
  });

  it('C2 — a Rejected report never counts (5.2.5)', async () => {
    const report = await submit(f);
    await f.moderation.reject(report.id, 'Photograph shows a covered drain.', MANAGER);
    expect((await f.moderation.verifiedOpenCounts([f.clusterId])).get(f.clusterId)).toBe(0);
  });

  it('C3 — every active cluster appears in the map, with zero rather than absent (4.1.12)', async () => {
    // "No reports" and "we do not know about reports" are different facts: a cluster missing from
    // the map would exclude the driver and mark the score DEGRADED, which is a different claim.
    const counts = await f.moderation.verifiedOpenCounts([f.clusterId, 'cluster-with-nothing']);
    expect(counts.get('cluster-with-nothing')).toBe(0);
    expect(counts.size).toBe(2);
  });

  it('C4 — a report bound only to a locality does not enter any cluster count (5.1.8)', async () => {
    const near = await submit(f, NEAR);
    await f.moderation.verify(near.id, MANAGER);
    expect((await f.moderation.verifiedOpenCounts([f.clusterId])).get(f.clusterId)).toBe(0);
  });
});

describe('Visibility — §5.2.9, §5.3.5', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('V1 — photographs are withheld from other residents until the report is Verified (5.3.5)', async () => {
    const report = await f.controller.submitReport(
      { point: INSIDE, type: ReportType.StandingWater, description: 'tray', photos: [photo()] },
      RESIDENT,
    );
    expect((await f.controller.publicView(report.id, NEIGHBOUR)).photos).toHaveLength(0);
    await f.moderation.verify(report.id, MANAGER);
    expect((await f.controller.publicView(report.id, NEIGHBOUR)).photos).toHaveLength(1);
  });

  it('V2 — the reporter sees their own photographs immediately (5.3.5 says "other than the reporter")', async () => {
    const report = await f.controller.submitReport(
      { point: INSIDE, type: ReportType.StandingWater, description: 'tray', photos: [photo()] },
      RESIDENT,
    );
    expect((await f.controller.publicView(report.id, RESIDENT)).photos).toHaveLength(1);
  });

  it('V3 — the public projection carries no reporter identity (5.2.9)', async () => {
    const report = await submit(f);
    const view = await f.controller.publicView(report.id, NEIGHBOUR);
    expect(Object.keys(view.report)).not.toContain('reporterId');
    expect(JSON.stringify(view.report)).not.toContain(RESIDENT.accountId);
  });

  it('V4 — a resident listing their own reports gets only their own (2.3.2)', async () => {
    await submit(f, INSIDE, RESIDENT);
    await submit(f, FAR, NEIGHBOUR);
    const mine = await f.controller.listOwnReports(RESIDENT);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.reporterId).toBe(RESIDENT.accountId);
  });
});

describe('The reporter is told — §5.2.8', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('N1 — every status change notifies the reporter, and nobody else (5.2.8)', async () => {
    const report = await submit(f);
    expect(f.notifier.to(RESIDENT.accountId)).toHaveLength(0); // submission is not a change
    await f.moderation.verify(report.id, MANAGER);
    expect(f.notifier.to(RESIDENT.accountId)).toHaveLength(1);
    expect(f.notifier.to(RESIDENT.accountId)[0]).toMatch(/verified/);
    expect(f.notifier.to(NEIGHBOUR.accountId)).toHaveLength(0);
  });

  it('N2 — a rejection tells the resident the reason the moderator gave (5.2.4, 5.2.8, 10.5.3)', async () => {
    const report = await submit(f);
    await f.moderation.reject(report.id, 'The photograph shows a sealed drain cover.', MANAGER);
    expect(f.notifier.to(RESIDENT.accountId)[0]).toMatch(/sealed drain cover/);
  });
});

describe('The §8 join — 5.2.6, 5.2.7/8.5.1/8.5.2, 8.3.21', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  /** A verified report linked to a freshly created work order. */
  async function linked(): Promise<{ report: Report; workOrderId: string }> {
    const report = await verified(f);
    const workOrder = await f.dispatch.createWorkOrder(
      { clusterId: f.clusterId, taskType: TaskType.Fogging, scheduledDate: tomorrow(), sourceReportId: report.id },
      MANAGER,
    );
    await f.dispatch.linkVerifiedReports(workOrder.id, [report.id], f.reports);
    return { report, workOrderId: workOrder.id };
  }

  it('J1 — assigning the work order moves its linked reports to Actioned (5.2.6)', async () => {
    const { report, workOrderId } = await linked();
    await f.dispatch.assign(workOrderId, CREW.accountId, MANAGER);
    expect((await f.reports.findById(report.id))?.currentStatus()).toBe(ReportStatus.Actioned);
  });

  it('J2 — an Actioned report still counts toward the score: the site is not clear yet (5.2.5)', async () => {
    const { workOrderId } = await linked();
    await f.dispatch.assign(workOrderId, CREW.accountId, MANAGER);
    expect((await f.moderation.verifiedOpenCounts([f.clusterId])).get(f.clusterId)).toBe(1);
  });

  it('J3 — verifying the work order closes the report and tells the resident (5.2.7, 8.5.1, 8.5.2)', async () => {
    const { report, workOrderId } = await linked();
    await f.dispatch.assign(workOrderId, CREW.accountId, MANAGER);
    await f.workOrders.accept(workOrderId, CREW);
    await f.workOrders.start(workOrderId, CREW);
    const evidence = new CompletionEvidence();
    evidence.workOrderId = workOrderId;
    evidence.completedAt = new Date();
    evidence.taskPerformed = TaskType.Fogging;
    evidence.notes = 'Fogged and cleared the tray.';
    evidence.photoKeys = ['done.jpg'];
    evidence.rejectionReason = null;
    await f.workOrders.complete(workOrderId, evidence, CREW);
    await f.workOrders.verify(workOrderId, MANAGER);

    expect((await f.reports.findById(report.id))?.currentStatus()).toBe(ReportStatus.Closed);
    expect(f.notifier.to(RESIDENT.accountId).at(-1)).toMatch(/treated and closed/);
    // And the closed report leaves the driver: the work is done, so it stops pushing the score up.
    expect((await f.moderation.verifiedOpenCounts([f.clusterId])).get(f.clusterId)).toBe(0);
  });

  it('J4 — cancelling the work order returns the report to the status it held before (8.3.21)', async () => {
    const { report, workOrderId } = await linked();
    await f.dispatch.assign(workOrderId, CREW.accountId, MANAGER);
    expect((await f.reports.findById(report.id))?.currentStatus()).toBe(ReportStatus.Actioned);

    await f.dispatch.cancel(workOrderId, 'Crew redeployed to a higher-priority cluster.', MANAGER);
    // Verified, read from the history — not assumed, which is what makes a second actioning safe.
    expect((await f.reports.findById(report.id))?.currentStatus()).toBe(ReportStatus.Verified);
    expect((await f.moderation.verifiedOpenCounts([f.clusterId])).get(f.clusterId)).toBe(1);
  });

  it('J5 — only verified reports may be linked to a work order (8.1.13)', async () => {
    const submitted = await submit(f, northOf(INSIDE, 200), NEIGHBOUR);
    const workOrder = await f.dispatch.createWorkOrder(
      { clusterId: f.clusterId, taskType: TaskType.Larviciding, scheduledDate: tomorrow() },
      MANAGER,
    );
    await f.dispatch.linkVerifiedReports(workOrder.id, [submitted.id], f.reports);
    expect((await f.reports.findForWorkOrder(workOrder.id))).toHaveLength(0);
  });
});

describe('The dashboard sees reports — §7.5.3', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('B1 — the attention panel raises the moderation backlog with its age (7.5.3)', async () => {
    await submit(f, INSIDE, RESIDENT, ReportType.StandingWater, new Date(Date.now() - 5 * 3_600_000));
    const items = await f.dashboard.buildAttentionPanel(MANAGER);
    const item = items.find((i) => i.kind === 'reportAwaitingModeration');
    expect(item?.detail).toMatch(/1 report\(s\) awaiting moderation/);
    expect(item?.detail).toMatch(/5 hour\(s\)/);
  });

  it('B2 — the overview counts verified open reports rather than reporting null (7.1.x)', async () => {
    await verified(f);
    const overview = await f.dashboard.buildOverview(MANAGER);
    expect(overview.openVerifiedReports).toBe(1);
  });
});
