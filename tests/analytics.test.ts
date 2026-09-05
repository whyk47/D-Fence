/**
 * D-Fence — Lab 4 §3.2: the five §7.3 visualisations (US-7.3).
 *
 * Four of the five did not exist. Only 7.3.2's tier distribution was computed — the one chart a
 * dashboard can answer from today's scores with no history at all — so "analytics" was in effect a
 * pie chart of this afternoon.
 *
 * **The cases here are weighted towards the insufficient-data state, not towards the arithmetic.**
 * US-7.3's second acceptance criterion asks for it explicitly, and the reason is that the failure
 * mode of a chart is not a wrong number, it is a plausible one: a 30-day case series drawn from
 * four hours of snapshots is a flat line, and a flat line asserts "cases are steady", which the
 * data does not support. Summing a column is not where this feature can go wrong.
 */
import { describe, expect, it } from 'vitest';
import {
  AnalyticsController,
  MINIMUM_DAYS_FOR_A_TREND,
  MINIMUM_SAMPLES_FOR_A_MEDIAN,
} from '../src/control/AnalyticsController';
import { AccessControlService } from '../src/control/AccessControlService';
import { AccessPolicy } from '../src/control/AccessPolicy';
import { Principal } from '../src/control/Principal';
import {
  InMemoryAuditStore,
  InMemoryClusterStore,
  InMemoryPriorityScoreStore,
} from '../src/persistence/memory/InMemoryStores';
import { InMemoryReportStore } from '../src/persistence/memory/InMemoryReportStores';
import { InMemoryWorkOrderStore } from '../src/persistence/memory/InMemoryWorkOrderStores';
import { Cluster } from '../src/entity/Cluster';
import { ClusterSnapshot } from '../src/entity/ClusterSnapshot';
import { PriorityScore } from '../src/entity/PriorityScore';
import { Report } from '../src/entity/Report';
import { WorkOrder } from '../src/entity/WorkOrder';
import { GeoPoint, Polygon, PremisesMix } from '../src/entity/valueTypes';
import {
  ChangeClass,
  PriorityTier,
  ReportStatus,
  ReportType,
  Role,
  TaskType,
  WorkOrderStatus,
} from '../src/entity/enums';

const MANAGER = new Principal('manager-1', Role.OperationsManager, 'session-m');
const RESIDENT = new Principal('resident-1', Role.Resident, 'session-r');
const NOW = new Date('2026-09-03T12:00:00+08:00');

function ac(): AccessControlService {
  return new AccessControlService(new AccessPolicy(), new InMemoryAuditStore());
}

/** `offset` days before NOW, at the given Singapore hour. */
function daysAgo(offset: number, hour = 9): Date {
  const day = new Date(NOW.getTime() - offset * 86_400_000);
  return new Date(`${new Date(day.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00:00+08:00`);
}

function isoDay(offset: number): string {
  return new Date(NOW.getTime() - offset * 86_400_000 + 8 * 3_600_000).toISOString().slice(0, 10);
}

async function clusterStore(objectIds: string[]): Promise<InMemoryClusterStore> {
  const store = new InMemoryClusterStore();
  const records = objectIds.map((objectId) => {
    const cluster = new Cluster();
    cluster.objectId = objectId;
    cluster.locality = objectId;
    cluster.caseSize = 1;
    cluster.caseDelta = 0;
    cluster.changeClass = ChangeClass.NEW;
    cluster.isActive = true;
    cluster.heavyRainExpected = false;
    cluster.premisesMix = new PremisesMix();
    cluster.boundary = new Polygon([
      [new GeoPoint(1.35, 103.84), new GeoPoint(1.35, 103.85), new GeoPoint(1.36, 103.85), new GeoPoint(1.35, 103.84)],
    ]);
    return cluster;
  });
  await store.upsertFromFeed({ retrievedAt: NOW, records });
  return store;
}

async function snapshot(
  store: InMemoryClusterStore,
  objectId: string,
  at: Date,
  caseSize: number,
): Promise<void> {
  const cluster = await store.findByObjectId(objectId);
  const s = new ClusterSnapshot();
  s.id = `${objectId}-${at.toISOString()}`;
  s.clusterId = (cluster as Cluster).id;
  s.retrievedAt = at;
  s.caseSize = caseSize;
  s.boundary = (cluster as Cluster).boundary;
  s.fmelUpdD = '';
  await store.appendSnapshot(s);
}

function report(id: string, submittedAt: Date): Report {
  const r = new Report();
  r.id = id;
  r.reporterId = 'resident-1';
  r.type = ReportType.StandingWater;
  r.description = 'Standing water in an uncovered drum';
  r.point = new GeoPoint(1.355, 103.845);
  r.localityBinding = 'Bishan St 12';
  r.clusterId = null;
  r.workOrderId = null;
  r.corroborationCount = 0;
  r.submittedAt = submittedAt;
  r.applyStatus(ReportStatus.Submitted);
  return r;
}

function workOrder(id: string, createdAt: Date, verifiedAt: Date | null, assigneeId: string | null): WorkOrder {
  const w = new WorkOrder();
  w.id = id;
  w.clusterId = 'cluster-1';
  w.assigneeId = assigneeId;
  w.sourceReportId = null;
  w.taskType = TaskType.Fogging;
  w.scheduledDate = '2026-09-04';
  w.priority = PriorityTier.High;
  w.instructions = '';
  w.startedAt = null;
  w.cancellationReason = null;
  w.issueFlag = false;
  w.issueReason = null;
  w.createdAt = createdAt;
  w.verifiedAt = verifiedAt;
  w.applyStatus(verifiedAt === null ? WorkOrderStatus.Assigned : WorkOrderStatus.Verified);
  return w;
}

describe('7.3.1 — total active cases over the preceding 30 days', () => {
  it('C1 — one point per day, summed across clusters', async () => {
    const clusters = await clusterStore(['a', 'b']);
    for (let day = 0; day < 10; day += 1) {
      await snapshot(clusters, 'a', daysAgo(day), 10 + day);
      await snapshot(clusters, 'b', daysAgo(day), 5);
    }
    const chart = await new AnalyticsController(ac(), clusters, new InMemoryPriorityScoreStore()).activeCaseSeries(NOW);

    expect(chart.requirement).toBe('7.3.1');
    expect(chart.points).toHaveLength(10);
    expect(chart.points[chart.points.length - 1]).toEqual({ date: isoDay(0), value: 15 });
    // Oldest first, so a chart can draw it without re-sorting and getting it backwards.
    expect(chart.points[0]?.date).toBe(isoDay(9));
  });

  it('C2 — a cluster snapshotted twice in a day counts ONCE, at its last value', async () => {
    // The feed publishes current values, so the last reading of a day is that day's answer.
    // Summing both would double-count; averaging them would invent a number never observed.
    const clusters = await clusterStore(['a']);
    for (let day = 0; day < 8; day += 1) {
      await snapshot(clusters, 'a', daysAgo(day, 8), 20);
      await snapshot(clusters, 'a', daysAgo(day, 16), 25);
    }
    const chart = await new AnalyticsController(ac(), clusters, new InMemoryPriorityScoreStore()).activeCaseSeries(NOW);
    expect(chart.points.every((p) => p.value === 25)).toBe(true);
  });

  it('C3 — a CLOSED cluster still counts on the days it was open', async () => {
    const clusters = await clusterStore(['a', 'b']);
    for (let day = 0; day < 8; day += 1) {
      await snapshot(clusters, 'a', daysAgo(day), 10);
      await snapshot(clusters, 'b', daysAgo(day), 4);
    }
    await clusters.deactivateAbsent(new Set(['a'])); // 1.1.10 closes b today
    const chart = await new AnalyticsController(ac(), clusters, new InMemoryPriorityScoreStore()).activeCaseSeries(NOW);
    // Reading only active clusters would subtract b from every historical day it was part of,
    // making last week look retrospectively better than it was.
    expect(chart.points.every((p) => p.value === 14)).toBe(true);
  });

  it('C4 — a day with no snapshots is OMITTED, not drawn as zero', async () => {
    const clusters = await clusterStore(['a']);
    for (const day of [0, 1, 3, 4]) {
      await snapshot(clusters, 'a', daysAgo(day), 12);
    }
    const chart = await new AnalyticsController(ac(), clusters, new InMemoryPriorityScoreStore()).activeCaseSeries(NOW);
    // A missed ingestion cycle is not a day on which dengue stopped. A zero would draw a cliff.
    expect(chart.points).toHaveLength(4);
    expect(chart.points.some((p) => p.date === isoDay(2))).toBe(false);
  });

  it('C5 — the boundary: six days of history is insufficient, seven is not', async () => {
    const build = async (days: number): Promise<{ sufficient: boolean; insufficientReason: string | null }> => {
      const clusters = await clusterStore(['a']);
      for (let day = 0; day < days; day += 1) {
        await snapshot(clusters, 'a', daysAgo(day), 12);
      }
      return new AnalyticsController(ac(), clusters, new InMemoryPriorityScoreStore()).activeCaseSeries(NOW);
    };
    expect(MINIMUM_DAYS_FOR_A_TREND).toBe(7);
    const six = await build(6);
    expect(six.sufficient).toBe(false);
    expect(six.insufficientReason).toContain('6 of 7');
    expect((await build(7)).sufficient).toBe(true);
  });

  it('C6 — snapshots older than the 30-day window are excluded', async () => {
    const clusters = await clusterStore(['a']);
    for (let day = 0; day < 10; day += 1) {
      await snapshot(clusters, 'a', daysAgo(day), 12);
    }
    await snapshot(clusters, 'a', daysAgo(45), 999);
    const chart = await new AnalyticsController(ac(), clusters, new InMemoryPriorityScoreStore()).activeCaseSeries(NOW);
    expect(chart.points).toHaveLength(10);
    expect(chart.points.some((p) => p.value === 999)).toBe(false);
  });
});

describe('7.3.2 — the tier distribution', () => {
  /** Scores one tier per cluster, in the order the object ids are given. */
  async function scoreEach(
    clusters: InMemoryClusterStore,
    scores: InMemoryPriorityScoreStore,
    tiers: Array<[string, PriorityTier]>,
  ): Promise<void> {
    const saved: PriorityScore[] = [];
    for (const [objectId, tier] of tiers) {
      const cluster = await clusters.findByObjectId(objectId);
      const score = new PriorityScore();
      score.clusterId = (cluster as Cluster).id;
      score.rank = saved.length + 1;
      score.tier = tier;
      score.computedAt = NOW;
      score.contributions = [];
      saved.push(score);
    }
    await scores.saveAll(saved);
  }

  it('C7 — counted from the last scoring cycle, and insufficient before one has run', async () => {
    const scores = new InMemoryPriorityScoreStore();
    const analytics = new AnalyticsController(ac(), await clusterStore([]), scores);
    const empty = await analytics.tierDistribution();
    expect(empty.sufficient).toBe(false);
    expect(empty.insufficientReason).toBe('no scoring cycle has completed yet');

    const clusters = await clusterStore(['a', 'b', 'c', 'd']);
    const scored = new InMemoryPriorityScoreStore();
    await scoreEach(clusters, scored, [
      ['a', PriorityTier.High],
      ['b', PriorityTier.High],
      ['c', PriorityTier.Medium],
      ['d', PriorityTier.Low],
    ]);
    const full = await new AnalyticsController(ac(), clusters, scored).tierDistribution();
    expect(full.sufficient).toBe(true);
    expect(full.points).toEqual({ High: 2, Medium: 1, Low: 1 });
  });

  it('C7b — a closed cluster leaves the distribution, and the total tracks the cluster count', async () => {
    // 7.3.2 says the distribution of ACTIVE clusters. `scores.latest()` is the latest score per
    // cluster whether or not 1.1.10 has since closed it, so counting it unscoped means the chart
    // can only ever grow: every closure leaves its last score behind as permanent sediment, and
    // the total drifts away from the cluster count shown on every other screen. This is the same
    // defect that was found in `DashboardController`, in its second home.
    const clusters = await clusterStore(['a', 'b', 'c']);
    const scores = new InMemoryPriorityScoreStore();
    await scoreEach(clusters, scores, [
      ['a', PriorityTier.High],
      ['b', PriorityTier.Medium],
      ['c', PriorityTier.Low],
    ]);
    const analytics = new AnalyticsController(ac(), clusters, scores);

    const before = await analytics.tierDistribution();
    expect(before.points).toEqual({ High: 1, Medium: 1, Low: 1 });

    // NEA stops publishing 'a'. Its score row is untouched — nothing deletes priority history.
    await clusters.deactivateAbsent(new Set(['b', 'c']));

    const after = await analytics.tierDistribution();
    expect(after.points).toEqual({ High: 0, Medium: 1, Low: 1 });
    expect(sum(after.points)).toBe((await clusters.findActive()).length);
  });

  it('C7c — scores that all belong to closed clusters read as insufficient, not as three zeroes', async () => {
    // The distinction matters: three zeroes drawn without a caveat says "there are no high-priority
    // clusters today", which is a reassuring claim. The truth is that nothing is being scored.
    const clusters = await clusterStore(['a']);
    const scores = new InMemoryPriorityScoreStore();
    await scoreEach(clusters, scores, [['a', PriorityTier.High]]);
    await clusters.deactivateAbsent(new Set());

    const chart = await new AnalyticsController(ac(), clusters, scores).tierDistribution();
    expect(chart.sufficient).toBe(false);
    expect(chart.insufficientReason).toBe('every cluster that has been scored has since been closed');
  });
});

function sum(distribution: Record<PriorityTier, number>): number {
  return Object.values(distribution).reduce((total, count) => total + count, 0);
}

describe('7.3.3 — open work orders per Cleaning Crew Member', () => {
  it('C8 — counted per assignee, busiest first, with an unassigned bucket', async () => {
    const workOrders = new InMemoryWorkOrderStore();
    await workOrders.save(workOrder('w1', daysAgo(2), null, 'crew-1'));
    await workOrders.save(workOrder('w2', daysAgo(2), null, 'crew-1'));
    await workOrders.save(workOrder('w3', daysAgo(2), null, 'crew-2'));
    await workOrders.save(workOrder('w4', daysAgo(2), null, null));

    const chart = await new AnalyticsController(
      ac(),
      await clusterStore([]),
      new InMemoryPriorityScoreStore(),
      workOrders,
    ).crewWorkload();

    expect(chart.points[0]).toEqual({ crewId: 'crew-1', openWorkOrders: 2 });
    // Work that belongs to nobody is the thing a workload chart most needs to show (8.2.1).
    expect(chart.points).toContainEqual({ crewId: null, openWorkOrders: 1 });
    expect(chart.sufficient).toBe(true);
  });

  it('C9 — a verified order is not open, and no open work is a real answer, not an empty one', async () => {
    const workOrders = new InMemoryWorkOrderStore();
    await workOrders.save(workOrder('w1', daysAgo(3), daysAgo(1), 'crew-1'));
    const chart = await new AnalyticsController(
      ac(),
      await clusterStore([]),
      new InMemoryPriorityScoreStore(),
      workOrders,
    ).crewWorkload();
    expect(chart.points).toEqual([]);
    expect(chart.sufficient).toBe(true);
  });

  it('C10 — unwired work orders are insufficient, NOT an empty chart (the 7.5.3 argument)', async () => {
    const chart = await new AnalyticsController(
      ac(),
      await clusterStore([]),
      new InMemoryPriorityScoreStore(),
    ).crewWorkload();
    // "No crew has any work" and "we are not reading work orders" look identical on a bar chart
    // and mean opposite things, so the second one says so.
    expect(chart.sufficient).toBe(false);
    expect(chart.insufficientReason).toContain('not wired');
  });
});

describe('7.3.4 — median creation-to-verified turnaround', () => {
  async function turnaroundOf(hours: number[]): Promise<Awaited<ReturnType<AnalyticsController['turnaround']>>> {
    const workOrders = new InMemoryWorkOrderStore();
    hours.forEach((h, i) => {
      const verifiedAt = daysAgo(1);
      void workOrders.save(workOrder(`w${i}`, new Date(verifiedAt.getTime() - h * 3_600_000), verifiedAt, 'crew-1'));
    });
    return new AnalyticsController(
      ac(),
      await clusterStore([]),
      new InMemoryPriorityScoreStore(),
      workOrders,
    ).turnaround(NOW);
  }

  it('C11 — an odd sample takes the middle value', async () => {
    const chart = await turnaroundOf([2, 4, 6, 8, 100]);
    expect(chart.points.medianHours).toBe(6);
    expect(chart.points.sampleSize).toBe(5);
    expect(chart.sufficient).toBe(true);
  });

  it('C12 — an even sample averages the middle pair', async () => {
    const chart = await turnaroundOf([2, 4, 6, 10, 12, 14]);
    expect(chart.points.medianHours).toBe(8);
  });

  it('C13 — the median resists the outlier a mean would not', async () => {
    // One job left open over a long weekend. The requirement says median for this reason: the
    // number is read as "how long a job takes", which is a typical case and not an average one.
    const chart = await turnaroundOf([3, 4, 5, 6, 400]);
    expect(chart.points.medianHours).toBe(5);
    // Fastest and slowest travel with it, so a median of 5 over a 3-to-400 spread cannot be
    // misread as consistency.
    expect(chart.points.fastestHours).toBe(3);
    expect(chart.points.slowestHours).toBe(400);
  });

  it('C14 — the boundary: four verified orders is an anecdote, five is a median', async () => {
    expect(MINIMUM_SAMPLES_FOR_A_MEDIAN).toBe(5);
    const four = await turnaroundOf([1, 2, 3, 4]);
    expect(four.sufficient).toBe(false);
    expect(four.insufficientReason).toContain('4 of 5');
    // The number is still returned — the chart may draw what it has, it may not imply more.
    expect(four.points.medianHours).toBe(2.5);
    expect((await turnaroundOf([1, 2, 3, 4, 5])).sufficient).toBe(true);
  });

  it('C15 — an order verified before the window opened is excluded however long it took', async () => {
    const workOrders = new InMemoryWorkOrderStore();
    for (let i = 0; i < 5; i += 1) {
      await workOrders.save(workOrder(`w${i}`, daysAgo(3), daysAgo(2), 'crew-1'));
    }
    const old = workOrder('old', daysAgo(60), daysAgo(45), 'crew-1');
    await workOrders.save(old);
    const chart = await new AnalyticsController(
      ac(),
      await clusterStore([]),
      new InMemoryPriorityScoreStore(),
      workOrders,
    ).turnaround(NOW);
    expect(chart.points.sampleSize).toBe(5);
    expect(chart.points.medianHours).toBe(24);
  });
});

describe('7.3.5 — reports received per day', () => {
  it('C16 — thirty points, one per day, ending today', async () => {
    const reports = new InMemoryReportStore();
    await reports.save(report('r1', daysAgo(0)));
    await reports.save(report('r2', daysAgo(0)));
    await reports.save(report('r3', daysAgo(5)));

    const chart = await new AnalyticsController(
      ac(),
      await clusterStore([]),
      new InMemoryPriorityScoreStore(),
      null,
      reports,
    ).reportsPerDay(NOW);

    expect(chart.points).toHaveLength(30);
    expect(chart.points[chart.points.length - 1]).toEqual({ date: isoDay(0), value: 2 });
    expect(chart.points.find((p) => p.date === isoDay(5))?.value).toBe(1);
  });

  it('C17 — a day with no reports is a REAL zero, unlike 7.3.1s omitted day', async () => {
    const reports = new InMemoryReportStore();
    await reports.save(report('r1', daysAgo(0)));
    const chart = await new AnalyticsController(
      ac(),
      await clusterStore([]),
      new InMemoryPriorityScoreStore(),
      null,
      reports,
    ).reportsPerDay(NOW);
    // Nobody reported anything that Tuesday is a fact about the world; no snapshot was taken that
    // Tuesday is a fact about the scheduler. The two must not be drawn the same way.
    expect(chart.points.find((p) => p.date === isoDay(3))?.value).toBe(0);
  });

  it('C18 — with no reports at all the chart is insufficient, not a confident flat zero', async () => {
    const chart = await new AnalyticsController(
      ac(),
      await clusterStore([]),
      new InMemoryPriorityScoreStore(),
      null,
      new InMemoryReportStore(),
    ).reportsPerDay(NOW);
    expect(chart.sufficient).toBe(false);
    expect(chart.points).toHaveLength(30);
  });

  it('C19 — every report counts, whatever its moderation outcome', async () => {
    const reports = new InMemoryReportStore();
    const rejected = report('r1', daysAgo(1));
    rejected.applyStatus(ReportStatus.Rejected);
    await reports.save(rejected);
    await reports.save(report('r2', daysAgo(1)));

    const chart = await new AnalyticsController(
      ac(),
      await clusterStore([]),
      new InMemoryPriorityScoreStore(),
      null,
      reports,
    ).reportsPerDay(NOW);
    // This chart is about how much the public is telling us. Filtering to verified reports would
    // turn a demand curve into a moderation curve.
    expect(chart.points.find((p) => p.date === isoDay(1))?.value).toBe(2);
  });
});

describe('All five together — §2.3.4', () => {
  it('C20 — buildAll returns all five, each naming the requirement it realises', async () => {
    const charts = await new AnalyticsController(
      ac(),
      await clusterStore([]),
      new InMemoryPriorityScoreStore(),
      new InMemoryWorkOrderStore(),
      new InMemoryReportStore(),
    ).buildAll(MANAGER, NOW);

    expect(Object.values(charts).map((c) => c.requirement).sort()).toEqual([
      '7.3.1', '7.3.2', '7.3.3', '7.3.4', '7.3.5',
    ]);
    // Every chart states its sufficiency, so no screen has to decide for itself what "enough" is.
    expect(Object.values(charts).every((c) => typeof c.sufficient === 'boolean')).toBe(true);
  });

  it('C21 — a Resident is refused the analytics screen (2.3.4)', async () => {
    const analytics = new AnalyticsController(ac(), await clusterStore([]), new InMemoryPriorityScoreStore());
    await expect(analytics.buildAll(RESIDENT, NOW)).rejects.toThrow(/not authorised/);
  });
});
