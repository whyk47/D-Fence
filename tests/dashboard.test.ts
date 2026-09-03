/**
 * D-Fence — Lab 4 §3.2: the operations dashboard (7.x) and the authorisation that guards it (2.3.x).
 *
 * The two things worth testing here are not the arithmetic. They are: **a Resident cannot reach the
 * dashboard and the refusal is logged** (2.3.3, 2.3.7, 2.3.8), and **a value that cannot be computed
 * is null rather than zero** — a false all-clear on the panel whose entire purpose is raising alarm.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { AccessControlService, NotAuthorised } from '../src/control/AccessControlService';
import { AccessPolicy } from '../src/control/AccessPolicy';
import { DashboardController, principalFor, PriorityRow } from '../src/control/DashboardController';
import { formatSgt } from '../src/boundary/http/OpsDashboardPage';
import {
  InMemoryAuditStore,
  InMemoryClusterStore,
  InMemoryIngestionRunStore,
  InMemoryPriorityScoreStore,
} from '../src/persistence/memory/InMemoryStores';
import { Cluster } from '../src/entity/Cluster';
import { PriorityScore } from '../src/entity/PriorityScore';
import { DriverContribution } from '../src/entity/DriverContribution';
import { PremisesMix } from '../src/entity/valueTypes';
import { Driver, PriorityTier, Role, SourceKind } from '../src/entity/enums';

const AT = new Date('2026-09-03T04:00:00Z');

function cluster(id: string, locality: string, caseSize: number, delta = 0): Cluster {
  const c = new Cluster();
  c.id = id;
  c.objectId = id;
  c.locality = locality;
  c.caseSize = caseSize;
  c.caseDelta = delta;
  c.isActive = true;
  c.premisesMix = new PremisesMix();
  return c;
}

function score(clusterId: string, value: number, tier: PriorityTier, degraded: Driver[] = []): PriorityScore {
  const s = new PriorityScore();
  s.clusterId = clusterId;
  s.computedAt = AT;
  s.score = value;
  s.tier = tier;
  s.rank = 0;
  s.isDegraded = degraded.length > 0;
  s.excludedDrivers = degraded;
  const contribution = new DriverContribution();
  contribution.driver = Driver.CaseSize;
  contribution.rawValue = 258;
  contribution.normalisedValue = 0.97;
  contribution.weight = 0.3;
  contribution.contribution = 0.291;
  const treatment = new DriverContribution();
  treatment.driver = Driver.DaysSinceLastTreatment;
  treatment.rawValue = 90;
  treatment.normalisedValue = 1;
  treatment.weight = 0.15;
  treatment.contribution = 0.15;
  s.contributions = [contribution, treatment];
  return s;
}

describe('AccessControlService — §2.3', () => {
  let audit: InMemoryAuditStore;
  let ac: AccessControlService;

  beforeEach(() => {
    audit = new InMemoryAuditStore();
    ac = new AccessControlService(new AccessPolicy(), audit);
  });

  it('X1 — an Operations Manager may read the dashboard (2.3.4)', async () => {
    await expect(
      ac.authorise(principalFor(Role.OperationsManager), 'dashboard:read', { kind: 'dashboard' }),
    ).resolves.toBeUndefined();
  });

  it('X2 — a Resident may not, and the refusal carries no detail (2.3.3, 2.3.7)', async () => {
    await expect(
      ac.authorise(principalFor(Role.Resident), 'dashboard:read', { kind: 'dashboard' }),
    ).rejects.toBeInstanceOf(NotAuthorised);
  });

  it('X3 — every refusal is logged before it is thrown (2.3.8)', async () => {
    await ac.authorise(principalFor(Role.CleaningCrew), 'dashboard:read', { kind: 'dashboard' }).catch(() => undefined);
    expect(audit.size()).toBe(1);
    expect((await audit.recent(1))[0]?.action).toBe('DENIED:dashboard:read');
  });

  it('X4 — an ownership-scoped action compares the owner, not just the role (2.3.1)', async () => {
    const resident = principalFor(Role.Resident, 'account-1');
    await expect(ac.may(resident, 'savedLocation:read', { kind: 'savedLocation', ownerId: 'account-1' })).resolves.toBe(true);
    await expect(ac.may(resident, 'savedLocation:read', { kind: 'savedLocation', ownerId: 'account-2' })).resolves.toBe(false);
  });

  it('X5 — an ownership-scoped resource with no owner is refused, not allowed', async () => {
    await expect(
      ac.may(principalFor(Role.Resident, 'account-1'), 'savedLocation:read', { kind: 'savedLocation' }),
    ).resolves.toBe(false);
  });
});

describe('DashboardController — §7', () => {
  const manager = principalFor(Role.OperationsManager);
  let clusters: InMemoryClusterStore;
  let scores: InMemoryPriorityScoreStore;
  let runs: InMemoryIngestionRunStore;
  let dashboard: DashboardController;

  beforeEach(async () => {
    clusters = new InMemoryClusterStore();
    scores = new InMemoryPriorityScoreStore();
    runs = new InMemoryIngestionRunStore();
    dashboard = new DashboardController(
      new AccessControlService(new AccessPolicy(), new InMemoryAuditStore()),
      clusters,
      scores,
      runs,
    );
    await clusters.upsertFromFeed({
      retrievedAt: AT,
      records: [
        cluster('c1', 'Countryside Rd, Walk / Florissa Pk', 258, 12),
        cluster('c2', 'Punggol Dr (Blk 612A)', 2),
        cluster('c3', 'Marymount Rd', 2),
      ],
    });
    const stored = await clusters.findActive();
    await scores.saveAll([
      score(stored[0]?.id as string, 65.2, PriorityTier.Medium, [Driver.VerifiedOpenReportCount]),
      score(stored[1]?.id as string, 29.7, PriorityTier.Low),
      score(stored[2]?.id as string, 82.0, PriorityTier.High),
    ]);
  });

  it('D1 — the overview counts clusters and cases, and distributes tiers (7.1.2–7.1.4, 7.3.2)', async () => {
    const overview = await dashboard.buildOverview(manager);
    expect(overview.activeClusters).toBe(3);
    expect(overview.totalActiveCases).toBe(262);
    expect(overview.highTierClusters).toBe(1);
    expect(overview.tierDistribution).toEqual({ High: 1, Medium: 1, Low: 1 });
    expect(overview.dataAsOf).toEqual(AT);
  });

  it('D2 — a count that cannot be computed yet is null, never 0 (no false all-clear)', async () => {
    const overview = await dashboard.buildOverview(manager);
    expect(overview.openVerifiedReports).toBeNull();
    expect(overview.openWorkOrders).toBeNull();
    expect(overview.overdueWorkOrders).toBeNull();
    // And week-over-week stays null until seven days of history exist, rather than comparing
    // against whatever happens to be the oldest row.
    expect(overview.weekOverWeek.totalActiveCases).toBeNull();
  });

  it('D3 — a Resident cannot build the dashboard, even calling the controller directly (2.3.3)', async () => {
    await expect(dashboard.buildOverview(principalFor(Role.Resident))).rejects.toBeInstanceOf(NotAuthorised);
    await expect(dashboard.buildPriorityTable(principalFor(Role.Resident))).rejects.toBeInstanceOf(NotAuthorised);
  });

  it('D4 — the table carries every 7.2.2 column and the 7.2.6 breakdown', async () => {
    const rows = await dashboard.buildPriorityTable(manager);
    const top = rows.find((r) => r.caseSize === 258) as PriorityRow;
    expect(top.locality).toContain('Countryside');
    expect(top.caseDelta).toBe(12);
    expect(top.daysSinceLastTreatment).toBe(90);
    expect(top.breakdown).toHaveLength(2);
    // 7.2.6 sends the breakdown with the row, so expanding it costs no round trip.
    expect(top.breakdown[0]?.driver).toBeDefined();
  });

  it('D5 — a degraded row is marked and its excluded drivers named (7.2.8, 7.2.9)', async () => {
    const rows = await dashboard.buildPriorityTable(manager);
    const degraded = rows.filter((r) => r.isDegraded);
    expect(degraded).toHaveLength(1);
    expect(degraded[0]?.excludedDrivers).toEqual([Driver.VerifiedOpenReportCount]);
  });

  it('D6 — filtering by tier and sorting by a column both apply (7.2.3, 7.2.4)', async () => {
    const medium = await dashboard.buildPriorityTable(manager, { tier: PriorityTier.Medium });
    expect(medium).toHaveLength(1);

    const bySize = await dashboard.buildPriorityTable(manager, { sortBy: 'caseSize', descending: true });
    expect(bySize.map((r) => r.caseSize)).toEqual([258, 2, 2]);
  });

  it('D7 — a cluster with no stored score is omitted, not shown with a blank score', async () => {
    await clusters.upsertFromFeed({ retrievedAt: AT, records: [cluster('c4', 'Bishan St 12', 9)] });
    const rows = await dashboard.buildPriorityTable(manager);
    expect(rows).toHaveLength(3);
    expect(rows.some((r) => r.locality === 'Bishan St 12')).toBe(false);
  });

  it('D8 — the CSV quotes a locality containing commas, so the columns do not shift (7.4.3)', async () => {
    const rows = await dashboard.buildPriorityTable(manager);
    const csv = DashboardController.toCsv(rows);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(rows.length + 1);
    expect(csv).toContain('"Countryside Rd, Walk / Florissa Pk"');
    // Every line must have the same number of quoted cells as the header.
    const cells = (line: string): number => (line.match(/","/g) ?? []).length;
    expect(new Set(lines.map(cells)).size).toBe(1);
  });

  it('D9 — THREE consecutive failed runs raise an attention item; one does not (1.4.3, 7.5.1)', async () => {
    // Corrected 2026-09-03 with US-1.5. This case used to assert that a single failed run raised
    // the item, which is what the code did and is not what 1.4.3 says. A public API returning one
    // 503 is ordinary; warning on it trains a manager to ignore the panel.
    const fail = async (): Promise<void> => {
      const run = await runs.recordStart(SourceKind.Clusters, 'SCHEDULED');
      await runs.recordOutcome(run, 'FAILED', 0);
    };
    const succeed = async (): Promise<void> => {
      const run = await runs.recordStart(SourceKind.Clusters, 'SCHEDULED');
      await runs.recordOutcome(run, 'SUCCESS', 15);
    };

    await succeed();
    await fail();
    expect((await dashboard.buildAttentionPanel(manager)).some((i) => i.kind === 'sourceHealth')).toBe(false);

    await fail();
    await fail();
    const items = await dashboard.buildAttentionPanel(manager);
    expect(items.some((i) => i.kind === 'sourceHealth' && i.detail.includes('Clusters'))).toBe(true);
    // 7.5.4: every attention item links to where it can be resolved.
    expect(items.every((i) => i.link.startsWith('/'))).toBe(true);
  });

  it('D10 — a source with a successful run raises nothing', async () => {
    const run = await runs.recordStart(SourceKind.Clusters, 'SCHEDULED');
    await runs.recordOutcome(run, 'SUCCESS', 15);
    const health = await dashboard.reportSourceHealth();
    expect(health.find((h) => h.source === SourceKind.Clusters)?.isWarning).toBe(false);
  });
});

describe('Presentation conventions (11.5.x)', () => {
  it('P1 — one timestamp format, in Singapore time, everywhere', () => {
    expect(formatSgt(new Date('2026-09-03T06:35:00Z'))).toBe('03 Sep 2026 14:35 SGT');
  });

  it('P2 — an absent timestamp renders as an em dash, not as the epoch', () => {
    expect(formatSgt(null)).toBe('—');
  });
});
