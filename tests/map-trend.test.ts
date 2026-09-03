/**
 * D-Fence — Lab 4 §3.2: the map, the trend and the history (§9).
 *
 * Two halves.
 *
 * **`TrendAnalyser.classify` is the only judgement in §9** — everything else displays a fact — so
 * it is tested at its band edges the way `assignTier` is. It is pure for that reason.
 *
 * **The layers are an access-control surface.** 9.1.4 and 9.1.5 read as display rules and are
 * really §2.3 in map clothing: the cases below check that a resident's home never appears in
 * another resident's layer, and that an unmoderated report never reaches a public map.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { AccessControlService } from '../src/control/AccessControlService';
import { AccessPolicy } from '../src/control/AccessPolicy';
import { MapViewController } from '../src/control/MapViewController';
import { TrendAnalyser, TRAJECTORY_BAND, SeriesPoint } from '../src/control/TrendAnalyser';
import { PriorityScoringEngine } from '../src/control/PriorityScoringEngine';
import { NormalisationFactory } from '../src/control/normalisation/NormalisationFactory';
import { ConfigLoader } from '../src/config/ConfigLoader';
import { principalFor } from '../src/control/DashboardController';
import {
  InMemoryAuditStore,
  InMemoryClusterStore,
  InMemoryPriorityScoreStore,
} from '../src/persistence/memory/InMemoryStores';
import { InMemoryReportStore } from '../src/persistence/memory/InMemoryReportStores';
import { InMemorySavedLocationStore } from '../src/persistence/memory/InMemoryLocationStores';
import { InMemoryWorkOrderStore } from '../src/persistence/memory/InMemoryWorkOrderStores';
import { Cluster } from '../src/entity/Cluster';
import { ClusterSnapshot } from '../src/entity/ClusterSnapshot';
import { Report } from '../src/entity/Report';
import { SavedLocation } from '../src/entity/SavedLocation';
import { WorkOrder } from '../src/entity/WorkOrder';
import { GeoPoint, Polygon, PremisesMix } from '../src/entity/valueTypes';
import {
  ExposureStatus,
  LocationLabel,
  PriorityTier,
  ReportStatus,
  ReportType,
  Role,
  TaskType,
  Trajectory,
  WorkOrderStatus,
} from '../src/entity/enums';
import { Principal } from '../src/control/Principal';

const MANAGER = principalFor(Role.OperationsManager, 'manager-1');
const RESIDENT = new Principal('resident-1', Role.Resident, 'session-r1');
const OTHER = new Principal('resident-2', Role.Resident, 'session-r2');
const CREW = new Principal('crew-1', Role.CleaningCrew, 'session-crew');
const OTHER_CREW = new Principal('crew-2', Role.CleaningCrew, 'session-crew-2');

const CENTRE = new GeoPoint(1.4300, 103.7900);

function series(...sizes: number[]): SeriesPoint[] {
  return sizes.map((caseSize, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, caseSize }));
}

interface Fixture {
  map: MapViewController;
  trends: TrendAnalyser;
  clusters: InMemoryClusterStore;
  reports: InMemoryReportStore;
  workOrders: InMemoryWorkOrderStore;
  locations: InMemorySavedLocationStore;
  clusterId: string;
}

async function fixture(): Promise<Fixture> {
  const clusters = new InMemoryClusterStore();
  const cluster = new Cluster();
  cluster.objectId = 'c-1';
  cluster.locality = 'Marsiling Rise';
  cluster.caseSize = 31;
  cluster.caseDelta = 3;
  cluster.isActive = true;
  cluster.premisesMix = new PremisesMix(['Bin'], [], []);
  const d = 200 / 111_320;
  cluster.boundary = new Polygon([
    [
      new GeoPoint(CENTRE.latitude - d, CENTRE.longitude - d),
      new GeoPoint(CENTRE.latitude + d, CENTRE.longitude - d),
      new GeoPoint(CENTRE.latitude + d, CENTRE.longitude + d),
      new GeoPoint(CENTRE.latitude - d, CENTRE.longitude + d),
      new GeoPoint(CENTRE.latitude - d, CENTRE.longitude - d),
    ],
  ]);
  await clusters.upsertFromFeed({ retrievedAt: new Date('2026-09-03T10:00:00+08:00'), records: [cluster] });
  const stored = (await clusters.findActive())[0] as Cluster;

  const scores = new InMemoryPriorityScoreStore();
  const config = ConfigLoader.load();
  const engine = new PriorityScoringEngine(NormalisationFactory.build(config.normalisation), config, scores);
  await engine.computeScores([stored], new Map(), new Date());

  const reports = new InMemoryReportStore();
  const workOrders = new InMemoryWorkOrderStore();
  const locations = new InMemorySavedLocationStore();
  const ac = new AccessControlService(new AccessPolicy(), new InMemoryAuditStore());
  const trends = new TrendAnalyser(clusters);

  return {
    map: new MapViewController(ac, clusters, scores, trends, reports, workOrders, locations),
    trends,
    clusters,
    reports,
    workOrders,
    locations,
    clusterId: stored.id,
  };
}

/** Appends one snapshot, `daysAgo` before now. */
async function snapshot(f: Fixture, daysAgo: number, caseSize: number, now = new Date()): Promise<void> {
  const snap = new ClusterSnapshot();
  snap.clusterId = f.clusterId;
  snap.retrievedAt = new Date(now.getTime() - daysAgo * 86_400_000);
  snap.caseSize = caseSize;
  snap.fmelUpdD = '';
  await f.clusters.appendSnapshot(snap);
}

async function report(f: Fixture, status: ReportStatus, point = CENTRE): Promise<Report> {
  const r = new Report();
  r.reporterId = RESIDENT.accountId;
  r.point = point;
  r.type = ReportType.StandingWater;
  r.description = 'Standing water';
  r.clusterId = f.clusterId;
  r.localityBinding = 'Marsiling Rise';
  r.corroborationCount = 0;
  r.submittedAt = new Date();
  r.moderatorId = null;
  r.moderatedAt = null;
  r.moderationReason = null;
  r.workOrderId = null;
  r.applyStatus(status);
  return f.reports.save(r);
}

async function workOrder(f: Fixture, assigneeId: string | null): Promise<WorkOrder> {
  const w = new WorkOrder();
  w.clusterId = f.clusterId;
  w.assigneeId = assigneeId;
  w.sourceReportId = null;
  w.taskType = TaskType.Fogging;
  w.scheduledDate = '2026-09-04';
  w.priority = PriorityTier.Medium;
  w.instructions = '';
  w.startedAt = null;
  w.cancellationReason = null;
  w.issueFlag = false;
  w.issueReason = null;
  w.applyStatus(assigneeId === null ? WorkOrderStatus.Created : WorkOrderStatus.Assigned);
  return f.workOrders.save(w);
}

async function savedLocation(f: Fixture, accountId: string, name: string): Promise<SavedLocation> {
  const l = new SavedLocation();
  l.accountId = accountId;
  l.inputText = '730123';
  l.resolvedAddress = 'BLK 123';
  l.point = CENTRE;
  l.label = LocationLabel.Home;
  l.name = name;
  l.exposureStatus = ExposureStatus.IN_CLUSTER;
  l.exposure = { clusterId: f.clusterId, clusterLocality: 'Marsiling Rise', caseSize: 31, distanceMetres: 0, dataTimestamp: null };
  l.rain24hMm = null;
  l.rain72hMm = null;
  l.evaluatedAt = new Date();
  return f.locations.save(l);
}

describe('Trajectory — §9.1.10', () => {
  it('J1 — a rise of more than the band is Growing; a fall is Receding', () => {
    expect(TrendAnalyser.classify(series(10, 12, 15))).toBe(Trajectory.Growing);
    expect(TrendAnalyser.classify(series(20, 15, 10))).toBe(Trajectory.Receding);
  });

  it('J2 — exactly the band in either direction is classified, not left Stable (boundary)', () => {
    const from = 100;
    const up = from * (1 + TRAJECTORY_BAND);
    const down = from * (1 - TRAJECTORY_BAND);
    expect(TrendAnalyser.classify(series(from, up))).toBe(Trajectory.Growing);
    expect(TrendAnalyser.classify(series(from, down))).toBe(Trajectory.Receding);
  });

  it('J3 — just inside the band either way is Stable (boundary)', () => {
    expect(TrendAnalyser.classify(series(100, 109))).toBe(Trajectory.Stable);
    expect(TrendAnalyser.classify(series(100, 91))).toBe(Trajectory.Stable);
  });

  it('J4 — the ENDS are compared, not the last step', () => {
    // Up, down, up: a rule that read the final step would call this Receding on one quiet day.
    expect(TrendAnalyser.classify(series(10, 20, 30, 25))).toBe(Trajectory.Growing);
  });

  it('J5 — a series too short to judge is Stable, not Growing', () => {
    expect(TrendAnalyser.classify([])).toBe(Trajectory.Stable);
    expect(TrendAnalyser.classify(series(40))).toBe(Trajectory.Stable);
  });

  it('J6 — growth from zero is Growing, and does not divide by zero', () => {
    expect(TrendAnalyser.classify(series(0, 4))).toBe(Trajectory.Growing);
    expect(TrendAnalyser.classify(series(0, 0))).toBe(Trajectory.Stable);
  });
});

describe('Case series — §9.1.9', () => {
  let f: Fixture;
  const now = new Date('2026-09-03T12:00:00+08:00');
  beforeEach(async () => {
    f = await fixture();
  });

  it('S1 — one point per calendar day, taking the last observation of each (9.1.9)', async () => {
    // The feed is polled hourly, so a day carries many identical snapshots. Two on the same day,
    // and the later one is what that day means.
    await snapshot(f, 1, 20, now);
    await snapshot(f, 1, 22, now);
    await snapshot(f, 0, 25, now);
    const points = await f.trends.caseSeries(f.clusterId, 30, now);
    expect(points).toHaveLength(2);
    expect(points[0]?.caseSize).toBe(22);
    expect(points[1]?.caseSize).toBe(25);
  });

  it('S2 — the window is 30 days and excludes anything older (9.1.9, boundary)', async () => {
    await snapshot(f, 31, 5, now);
    await snapshot(f, 29, 40, now);
    const points = await f.trends.caseSeries(f.clusterId, 30, now);
    expect(points.map((p) => p.caseSize)).toEqual([40]);
  });

  it('S3 — the trajectory reads 14 days even when the chart shows 30 (9.1.9, 9.1.10)', async () => {
    // The cluster halved a month ago and has been flat for a fortnight. Over 30 days that reads as
    // Receding; over 14 it is Stable, and 9.1.10 asks for the fortnight.
    await snapshot(f, 28, 100, now);
    await snapshot(f, 13, 50, now);
    await snapshot(f, 1, 50, now);
    expect(TrendAnalyser.classify(await f.trends.caseSeries(f.clusterId, 30, now))).toBe(Trajectory.Receding);
    expect(await f.trends.trajectoryOf(f.clusterId, now)).toBe(Trajectory.Stable);
  });

  it('S4 — a cluster with no history yields an empty series and a Stable label', async () => {
    expect(await f.trends.caseSeries(f.clusterId, 30, now)).toHaveLength(0);
    expect(await f.trends.trajectoryOf(f.clusterId, now)).toBe(Trajectory.Stable);
  });
});

describe('Map layers — §9.1.1 to §9.1.6', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('M1 — cluster boundaries carry a tier AND a tier label in words (9.1.2, 9.1.11)', async () => {
    const layers = await f.map.layers(MANAGER);
    expect(layers.clusters).toHaveLength(1);
    // 9.1.11 was tightened in v0.3 precisely because colour alone is not a means of conveying it.
    expect(layers.clusters[0]?.tierLabel).toMatch(/priority$/);
    expect(layers.clusters[0]?.ring).toHaveLength(5);
  });

  it('M2 — the ring is in GeoJSON order, longitude first', async () => {
    const layers = await f.map.layers(MANAGER);
    const [lng, lat] = layers.clusters[0]?.ring[0] as [number, number];
    // Swapping these puts Singapore in Somalia, and nothing in the type system catches it.
    expect(lng).toBeGreaterThan(100);
    expect(lat).toBeLessThan(10);
  });

  it('M3 — a resident sees verified reports but NOT unmoderated ones (9.1.3, 5.3.5)', async () => {
    await report(f, ReportStatus.Submitted);
    await report(f, ReportStatus.Verified);
    const resident = await f.map.layers(RESIDENT);
    // An unmoderated report is an unchecked claim about a specific address.
    expect(resident.reports.map((r) => r.status)).toEqual([ReportStatus.Verified]);
  });

  it('M4 — a manager sees unmoderated reports too (2.3.4)', async () => {
    await report(f, ReportStatus.Submitted);
    await report(f, ReportStatus.Verified);
    expect((await f.map.layers(MANAGER)).reports).toHaveLength(2);
  });

  it('M5 — no report marker carries the reporter\'s identity (5.2.9)', async () => {
    const r = await report(f, ReportStatus.Verified);
    const layers = await f.map.layers(RESIDENT);
    expect(JSON.stringify(layers.reports)).not.toContain(r.reporterId);
  });

  it('M6 — a crew member sees only work orders assigned to them (9.1.4, 2.3.5)', async () => {
    await workOrder(f, CREW.accountId);
    await workOrder(f, OTHER_CREW.accountId);
    expect(await f.map.layers(CREW).then((l) => l.workOrders)).toHaveLength(1);
    expect(await f.map.layers(MANAGER).then((l) => l.workOrders)).toHaveLength(2);
  });

  it('M7 — a resident sees no work orders at all (2.3.3)', async () => {
    await workOrder(f, CREW.accountId);
    expect((await f.map.layers(RESIDENT)).workOrders).toHaveLength(0);
  });

  it('M8 — a resident sees their own saved locations and nobody else\'s (9.1.5, 2.3.1)', async () => {
    await savedLocation(f, RESIDENT.accountId, 'My home');
    await savedLocation(f, OTHER.accountId, 'Their home');
    const mine = await f.map.layers(RESIDENT);
    expect(mine.savedLocations.map((l) => l.label)).toEqual(['My home']);
    // A home address on the wrong map is the most sensitive leak in the system.
    expect(JSON.stringify(mine.savedLocations)).not.toContain('Their home');
  });

  it('M9 — a manager sees no saved locations: they are not theirs to see (2.3.1)', async () => {
    await savedLocation(f, RESIDENT.accountId, 'My home');
    expect((await f.map.layers(MANAGER)).savedLocations).toHaveLength(0);
  });

  it('M10 — the layers arrive separately, so 9.1.6 can hide one without the rest', async () => {
    const layers = await f.map.layers(MANAGER);
    expect(Object.keys(layers).sort()).toEqual(['clusters', 'reports', 'savedLocations', 'workOrders']);
  });
});

describe('Cluster detail — §9.1.7 to §9.1.10', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('P1 — the panel carries score, breakdown, reports, work orders and the series (9.1.8)', async () => {
    await report(f, ReportStatus.Verified);
    await workOrder(f, CREW.accountId);
    await snapshot(f, 2, 20);
    await snapshot(f, 0, 31);

    const detail = await f.map.clusterDetail(f.clusterId, MANAGER);
    expect(detail.score).toBeGreaterThan(0);
    expect(detail.breakdown.length).toBeGreaterThan(0);
    expect(detail.openReports).toBe(1);
    expect(detail.openWorkOrders).toHaveLength(1);
    expect(detail.series).toHaveLength(2);
    expect(detail.trajectory).toBe(Trajectory.Growing);
  });

  it('P2 — a resident gets the panel WITHOUT the driver breakdown (2.3.3, 2.3.4)', async () => {
    const detail = await f.map.clusterDetail(f.clusterId, RESIDENT);
    // Otherwise the dashboard is reachable by tapping a boundary, which is 2.3.3 with extra steps.
    expect(detail.breakdown).toHaveLength(0);
    expect(detail.locality).toBe('Marsiling Rise');
    expect(detail.caseSize).toBe(31);
  });

  it('P3 — a resident gets no work-order list either (2.3.3)', async () => {
    await workOrder(f, CREW.accountId);
    expect((await f.map.clusterDetail(f.clusterId, RESIDENT)).openWorkOrders).toHaveLength(0);
  });

  it('P4 — an unknown cluster is an error, not an empty panel', async () => {
    await expect(f.map.clusterDetail('no-such-cluster', MANAGER)).rejects.toThrow(/no cluster/);
  });
});
