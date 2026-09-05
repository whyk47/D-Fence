/**
 * D-Fence — DashboardController.
 * Stereotype: <<control>>. Traces: 7.1.1–7.1.9, 7.2.1–7.2.9, 7.3.2, 7.4.2, 7.4.3, 7.5.1, 2.3.4.
 *
 * Assembles what the Operations Manager sees. Three rules shape it:
 *
 * 1. **It reads stored scores; it never rescores for display** (7.2.1). A dashboard that recomputed
 *    would show numbers that never existed in the history 4.1.11 keeps, and the two would drift.
 * 2. **A count that cannot be computed yet is `null`, not 0.** Reports do not exist yet, and a zero
 *    would read as "none outstanding" — a false all-clear on the panel whose whole job is to raise
 *    attention. Every such field is typed `number | null`. Work-order counts became real on
 *    2026-09-03; the report count has not.
 * 3. **Authorisation happens here, not only at the route** (2.3.4). The route calls it too; putting
 *    it in the control class means a second caller — a scheduled export, a test — cannot bypass it.
 */
import { PriorityTier, Driver, SourceKind, Role } from '../entity/enums';
import { Uuid } from '../entity/valueTypes';
import { Cluster } from '../entity/Cluster';
import { PriorityScore } from '../entity/PriorityScore';
import { ClusterStore, IngestionRunStore, PriorityScoreStore, ReportStore, WorkOrderStore } from '../ports/Stores';
import { ReportStatus } from '../entity/enums';
import { WorkOrder } from '../entity/WorkOrder';
import { AccessControlService } from './AccessControlService';
import { SourceHealthController, SourceHealthRow } from './SourceHealthController';
import { Principal } from './Principal';

/** 7.1.2–7.1.6, with 7.1.9's timestamp. Null means "not computable yet", never "zero". */
export interface DashboardOverview {
  activeClusters: number;
  totalActiveCases: number;
  highTierClusters: number;
  openVerifiedReports: number | null;
  openWorkOrders: number | null;
  overdueWorkOrders: number | null;
  /** 7.3.2 — distribution across the three tiers. */
  tierDistribution: Record<PriorityTier, number>;
  /** 7.1.9 — the timestamp of the data being presented, not of the request. */
  dataAsOf: Date | null;
  /**
   * 1.4.4 — the sources whose data is older than one of their own intervals. Every screen that
   * presents this payload has what it needs to show the staleness indicator without asking a
   * second endpoint, which is what stops one screen from quietly not showing it.
   */
  staleSources: SourceKind[];
  /** 7.1.7's seven-day deltas, absent until seven days of history exist. */
  weekOverWeek: { totalActiveCases: number | null; activeClusters: number | null };
}

/** One row of 7.2.2. */
export interface PriorityRow {
  rank: number;
  clusterId: Uuid;
  locality: string;
  caseSize: number;
  caseDelta: number;
  rainfall24hMm: number | null;
  verifiedOpenReports: number | null;
  daysSinceLastTreatment: number | null;
  score: number;
  tier: PriorityTier;
  workOrderStatus: string | null;
  /** 7.2.8, 7.2.9 — marked, and the excluded drivers named. */
  isDegraded: boolean;
  excludedDrivers: Driver[];
  /** 7.2.6 — the full breakdown, sent with the row so expanding it costs no round trip. */
  breakdown: Array<{ driver: Driver; raw: number; normalised: number; weight: number; contribution: number }>;
}

export type SortColumn = 'rank' | 'locality' | 'caseSize' | 'caseDelta' | 'score' | 'tier';

export interface TableQuery {
  /** 7.2.4 */
  tier?: PriorityTier;
  /** 7.2.5 — accepted now, applied when work orders exist. */
  workOrderStatus?: string;
  /** 7.2.3 */
  sortBy?: SortColumn;
  descending?: boolean;
}

export interface AttentionItem {
  kind: 'sourceHealth' | 'overdueWorkOrder' | 'reportAwaitingModeration' | 'workOrderIssue';
  detail: string;
  /** 7.5.4 — where it can be resolved. */
  link: string;
}

export class DashboardController {
  constructor(
    private readonly ac: AccessControlService,
    private readonly clusters: ClusterStore,
    private readonly scores: PriorityScoreStore,
    private readonly runs: IngestionRunStore,
    /** Optional so the dashboard predates work orders rather than being blocked by them. */
    private readonly workOrders: WorkOrderStore | null = null,
    /** Same again for reports: null means "not wired", which is not the same as "none" (7.5.3). */
    private readonly reports: ReportStore | null = null,
    /**
     * 1.4.1-1.4.4. Optional so every existing caller keeps working; when it is absent the
     * dashboard builds a default one over the same run store, which reports the three ingesting
     * sources correctly and the geocoder as unconfigured rather than as healthy.
     */
    private readonly sourceHealth: SourceHealthController | null = null,
  ) {}

  /** 7.1.x. */
  async buildOverview(by: Principal): Promise<DashboardOverview> {
    await this.ac.authorise(by, 'dashboard:read', { kind: 'dashboard' });
    const active = await this.clusters.findActive();
    const latest = await this.scores.latest();
    const open = this.workOrders === null ? null : await this.workOrders.findAllOpen();

    const tierDistribution: Record<PriorityTier, number> = {
      [PriorityTier.High]: 0,
      [PriorityTier.Medium]: 0,
      [PriorityTier.Low]: 0,
    };
    // 7.1.x — the tiers must describe the SAME clusters the counts above describe.
    //
    // `scores.latest()` returns the most recent score for every cluster it has ever scored,
    // including ones since closed under 1.1.10, while `activeClusters` and `totalActiveCases` come
    // from `findActive()`. The two disagreed the moment anything closed: a dashboard reading
    // "16 active clusters" alongside a tier distribution summing to 43 is not a rounding
    // difference, it is two different questions answered under one heading.
    const activeIds = new Set(active.map((c) => c.id));
    for (const score of latest) {
      if (activeIds.has(score.clusterId)) {
        tierDistribution[score.tier] += 1;
      }
    }

    return {
      activeClusters: active.length,
      totalActiveCases: active.reduce((sum, c) => sum + c.caseSize, 0),
      highTierClusters: tierDistribution[PriorityTier.High],
      openVerifiedReports:
        this.reports === null
          ? null // still null when unwired: a false all-clear is worse than an empty cell (7.5.3)
          : [...(await this.reports.verifiedOpenCountByCluster()).values()].reduce((a, b) => a + b, 0),
      openWorkOrders: open === null ? null : open.length,
      overdueWorkOrders: open === null ? null : open.filter((w) => w.isOverdue(new Date())).length,
      tierDistribution,
      dataAsOf: latest.length === 0 ? null : (latest[0] as PriorityScore).computedAt,
      staleSources: (await this.reportSourceHealth()).filter((h) => h.isStale).map((h) => h.source),
      weekOverWeek: await this.weekOverWeek(active),
    };
  }

  /**
   * 7.2.x. Reads stored scores; never rescores for display.
   * A cluster with no stored score is omitted rather than shown with a blank score: the table is
   * "what the last scoring cycle produced", and a row that never went through it would be a
   * different claim wearing the same shape.
   */
  async buildPriorityTable(by: Principal, query: TableQuery = {}): Promise<PriorityRow[]> {
    await this.ac.authorise(by, 'priorityScore:read', { kind: 'priorityScore' });
    const latest = await this.scores.latest();
    const byId = new Map((await this.clusters.findActive()).map((c) => [c.id, c]));

    // 7.2.2's work-order status column: the open order for that cluster, or null when there is none.
    const openByCluster = new Map<Uuid, WorkOrder>();
    for (const workOrder of this.workOrders === null ? [] : await this.workOrders.findAllOpen()) {
      openByCluster.set(workOrder.clusterId, workOrder);
    }

    let rows = latest
      .filter((score) => byId.has(score.clusterId))
      .map((score) =>
        DashboardController.toRow(
          score,
          byId.get(score.clusterId) as Cluster,
          openByCluster.get(score.clusterId)?.currentStatus() ?? null,
        ),
      );

    if (query.tier !== undefined) {
      rows = rows.filter((r) => r.tier === query.tier);
    }
    if (query.workOrderStatus !== undefined) {
      rows = rows.filter((r) => r.workOrderStatus === query.workOrderStatus);
    }
    return DashboardController.sort(rows, query);
  }

  /**
   * 7.5.x. Source health (7.5.1), overdue work orders (7.5.2) and issue-flagged work orders (7.5.5)
   * are all carried. Reports awaiting moderation (7.5.3) is the one item still missing, and it is
   * marked in the code rather than silently absent, so the gap is visible here as well as in the
   * handover.
   */
  async buildAttentionPanel(by: Principal): Promise<AttentionItem[]> {
    await this.ac.authorise(by, 'dashboard:read', { kind: 'dashboard' });
    const items: AttentionItem[] = [];
    for (const health of await this.reportSourceHealth()) {
      if (health.isWarning) {
        items.push({
          kind: 'sourceHealth',
          // 10.5.3 — the reason, not a restated boolean. "three consecutive failed retrievals"
          // and "no attempt has succeeded for three intervals" send a manager to different places.
          detail: `${health.source}: ${health.reason}`,
          link: '/ops/sources',
        });
      }
    }
    for (const workOrder of this.workOrders === null ? [] : await this.workOrders.findAllOpen()) {
      if (workOrder.isOverdue(new Date())) {
        // 7.5.2
        items.push({
          kind: 'overdueWorkOrder',
          detail: `Work order ${workOrder.id} (${workOrder.taskType}) was due ${workOrder.scheduledDate}`,
          link: `/ops/work-orders/${workOrder.id}`,
        });
      }
      if (workOrder.issueFlag) {
        // 7.5.5 — added in v0.4 because an issue could be raised and never seen.
        items.push({
          kind: 'workOrderIssue',
          detail: `Issue on work order ${workOrder.id}: ${workOrder.issueReason ?? 'no reason given'}`,
          link: `/ops/work-orders/${workOrder.id}`,
        });
      }
    }
    // 7.5.3 — reports waiting on a moderator. One item carrying the count, not one per report:
    // a queue of forty would otherwise bury the source-health and overdue items underneath it.
    const awaiting = this.reports === null ? [] : await this.reports.findByStatus(ReportStatus.Submitted);
    if (awaiting.length > 0) {
      const oldest = awaiting.reduce((a, b) => (a.submittedAt <= b.submittedAt ? a : b));
      items.push({
        kind: 'reportAwaitingModeration',
        detail: `${awaiting.length} report(s) awaiting moderation; the oldest has waited ${Math.floor(
          (Date.now() - oldest.submittedAt.getTime()) / 3_600_000,
        )} hour(s)`,
        link: '/ops/moderation',
      });
    }
    return items;
  }

  /**
   * 1.4.1-1.4.3, 7.5.1. Delegated to SourceHealthController, which owns the rule.
   *
   * It used to be four lines here, and they warned on a single failed run against 1.4.3's three
   * consecutive intervals, over two sources against 1.4.1's every source. Both defects were
   * invisible from the dashboard's own tests, because the dashboard was asserting what it did
   * rather than what §1.4 asked for.
   */
  async reportSourceHealth(now = new Date()): Promise<SourceHealthRow[]> {
    return (this.sourceHealth ?? new SourceHealthController(this.runs)).report(now);
  }

  /**
   * 7.4.2, 7.4.3 — the current filtered view as CSV, every column and every row.
   *
   * Values are quoted and internal quotes doubled, because a locality is free text from NEA and
   * several of them contain commas — "Jln Kayu / Jln Tari Dulang, Payong, Piring" would otherwise
   * become four columns and shift every field after it.
   */
  static toCsv(rows: PriorityRow[]): string {
    const header = [
      'rank', 'locality', 'caseSize', 'caseDelta', 'rainfall24hMm', 'verifiedOpenReports',
      'daysSinceLastTreatment', 'score', 'tier', 'workOrderStatus', 'degraded', 'excludedDrivers',
    ];
    const cell = (value: unknown): string => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((r) =>
      [
        r.rank, r.locality, r.caseSize, r.caseDelta, r.rainfall24hMm, r.verifiedOpenReports,
        r.daysSinceLastTreatment, r.score, r.tier, r.workOrderStatus, r.isDegraded,
        r.excludedDrivers.join(' '),
      ].map(cell).join(','),
    );
    return [header.map(cell).join(','), ...lines].join('\n');
  }

  private static toRow(score: PriorityScore, cluster: Cluster, workOrderStatus: string | null): PriorityRow {
    const of = (driver: Driver): number | null =>
      score.contributions.find((c) => c.driver === driver)?.rawValue ?? null;
    return {
      rank: score.rank,
      clusterId: score.clusterId,
      locality: cluster.locality,
      caseSize: cluster.caseSize,
      caseDelta: cluster.caseDelta ?? 0,
      rainfall24hMm: of(Driver.Rainfall24h),
      verifiedOpenReports: of(Driver.VerifiedOpenReportCount),
      daysSinceLastTreatment: of(Driver.DaysSinceLastTreatment),
      score: score.score,
      tier: score.tier,
      workOrderStatus,
      isDegraded: score.isDegraded,
      excludedDrivers: score.excludedDrivers,
      breakdown: score.breakdown().map((c) => ({
        driver: c.driver,
        raw: c.rawValue,
        normalised: c.normalisedValue,
        weight: c.weight,
        contribution: c.contribution,
      })),
    };
  }

  /** 7.2.3. Rank ascending is the default because 7.2.1 states the table's natural order. */
  private static sort(rows: PriorityRow[], query: TableQuery): PriorityRow[] {
    const column = query.sortBy ?? 'rank';
    const direction = query.descending === true ? -1 : 1;
    const tierOrder: Record<PriorityTier, number> = {
      [PriorityTier.High]: 0,
      [PriorityTier.Medium]: 1,
      [PriorityTier.Low]: 2,
    };
    return [...rows].sort((a, b) => {
      switch (column) {
        case 'locality':
          return direction * a.locality.localeCompare(b.locality);
        case 'tier':
          return direction * (tierOrder[a.tier] - tierOrder[b.tier]);
        case 'caseSize':
          return direction * (a.caseSize - b.caseSize);
        case 'caseDelta':
          return direction * (a.caseDelta - b.caseDelta);
        case 'score':
          return direction * (a.score - b.score);
        default:
          return direction * (a.rank - b.rank);
      }
    });
  }

  /**
   * 7.1.7 — the change against seven days earlier.
   * Returns nulls until the history reaches back that far. Comparing against the oldest score we
   * happen to hold would produce a "week-over-week" figure covering two days, which is worse than
   * showing nothing: a wrong number is read, a missing one is questioned.
   */
  private async weekOverWeek(active: Cluster[]): Promise<{ totalActiveCases: number | null; activeClusters: number | null }> {
    const sample = active[0];
    if (sample === undefined) {
      return { totalActiveCases: null, activeClusters: null };
    }
    const history = await this.scores.historyFor(sample.id, 500);
    const weekAgo = Date.now() - 7 * 86_400_000;
    const oldest = history[history.length - 1];
    if (oldest === undefined || oldest.computedAt.getTime() > weekAgo) {
      return { totalActiveCases: null, activeClusters: null };
    }
    // TODO(E9): compare against the stored snapshot set from seven days ago once ClusterSnapshot
    // history is queried by date; the score history alone does not carry case counts.
    return { totalActiveCases: null, activeClusters: null };
  }
}

/** Convenience for a caller that has a role but no session — tests and the CLI. */
export function principalFor(role: Role, accountId = 'local'): Principal {
  return new Principal(accountId, role, 'local-session');
}
