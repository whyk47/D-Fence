/**
 * D-Fence — the five §7.3 visualisations.
 * Stereotype: <<control>>. Traces: 7.3.1–7.3.5, 2.3.4, 10.5.7.
 *
 * Four of the five did not exist. Only 7.3.2's tier distribution was computed, which is the one a
 * dashboard can answer from the current scores without any history at all — so "analytics" was in
 * effect a pie chart of today.
 *
 * **The rule that shapes every method here is US-7.3's second acceptance criterion: each chart must
 * show an explicit insufficient-data state before enough history exists.** That is not a nicety. A
 * 30-day case series drawn from four hours of snapshots is a flat line, and a flat line is a claim
 * — "cases are steady" — that the data does not support. A median turnaround over one work order is
 * that work order. So every result carries `sufficient` and, when it is false, a sentence saying
 * what is missing (10.5.3). A chart is entitled to draw what it has; it is not entitled to let the
 * reader mistake a short window for a stable one.
 *
 * Aggregation runs here rather than in the browser: 7.3.1 and 7.3.5 read thirty days of snapshots
 * and reports, and shipping those to a screen to be counted would put the §10.1 read budget on the
 * network for a number that is four bytes wide.
 */
import { PriorityTier } from '../entity/enums';
import { IsoDate, Uuid, singaporeDate } from '../entity/valueTypes';
import { ClusterStore, PriorityScoreStore, ReportStore, WorkOrderStore } from '../ports/Stores';
import { AccessControlService } from './AccessControlService';
import { Principal } from './Principal';

/** The window §7.3 names, four times over. */
export const ANALYTICS_WINDOW_DAYS = 30;

/**
 * Below this many distinct days with data, a series is reported as insufficient rather than drawn
 * as though it were a trend. Seven is the smallest window in which a weekday effect is visible —
 * reports arrive on weekends, crews work on weekdays — and 7.1.7 already uses seven days as the
 * shortest interval the system is willing to compare over.
 */
export const MINIMUM_DAYS_FOR_A_TREND = 7;

/** Below this many completed work orders, a median is an anecdote. */
export const MINIMUM_SAMPLES_FOR_A_MEDIAN = 5;

export interface DailyPoint {
  date: IsoDate;
  value: number;
}

/** Every §7.3 result. `sufficient === false` means: draw it, and say what it is not yet. */
export interface Chart<T> {
  requirement: string;
  points: T;
  sufficient: boolean;
  /** 10.5.3 — the cause, in a sentence, or null when there is nothing to explain. */
  insufficientReason: string | null;
}

export interface CrewLoad {
  /** Null is the unassigned bucket: work that exists and belongs to nobody (8.2.1). */
  crewId: Uuid | null;
  openWorkOrders: number;
}

export interface TurnaroundSummary {
  medianHours: number | null;
  sampleSize: number;
  fastestHours: number | null;
  slowestHours: number | null;
}

export class AnalyticsController {
  constructor(
    private readonly ac: AccessControlService,
    private readonly clusters: ClusterStore,
    private readonly scores: PriorityScoreStore,
    private readonly workOrders: WorkOrderStore | null = null,
    private readonly reports: ReportStore | null = null,
  ) {}

  /** All five, in one authorised call — the dashboard draws them together. */
  async buildAll(by: Principal, now = new Date()): Promise<{
    activeCases: Chart<DailyPoint[]>;
    tierDistribution: Chart<Record<PriorityTier, number>>;
    crewWorkload: Chart<CrewLoad[]>;
    turnaround: Chart<TurnaroundSummary>;
    reportsPerDay: Chart<DailyPoint[]>;
  }> {
    // 2.3.4 — once, here, rather than five times: the five charts are one screen and one decision.
    await this.ac.authorise(by, 'dashboard:read', { kind: 'dashboard' });
    return {
      activeCases: await this.activeCaseSeries(now),
      tierDistribution: await this.tierDistribution(),
      crewWorkload: await this.crewWorkload(),
      turnaround: await this.turnaround(now),
      reportsPerDay: await this.reportsPerDay(now),
    };
  }

  /**
   * 7.3.1 — total active cases per day over the preceding 30 days.
   *
   * One point per day on which snapshots exist, taking each cluster's **last** snapshot of that day
   * and summing across clusters. Last rather than first or mean: the feed publishes current values,
   * so the last reading of a day is that day's answer, and averaging two readings of the same
   * cluster would invent a case count that was never true.
   *
   * A day with no snapshots is **omitted**, not zeroed. A missed ingestion cycle is not a day on
   * which dengue stopped, and a zero would draw a cliff.
   */
  async activeCaseSeries(now = new Date()): Promise<Chart<DailyPoint[]>> {
    const snapshots = await this.clusters.allSnapshotsSince(AnalyticsController.windowStart(now));
    const lastPerClusterPerDay = new Map<string, { at: number; caseSize: number }>();
    for (const snapshot of snapshots) {
      const key = `${AnalyticsController.dayOf(snapshot.retrievedAt)}|${snapshot.clusterId}`;
      const held = lastPerClusterPerDay.get(key);
      if (held === undefined || snapshot.retrievedAt.getTime() >= held.at) {
        lastPerClusterPerDay.set(key, { at: snapshot.retrievedAt.getTime(), caseSize: snapshot.caseSize });
      }
    }

    const totals = new Map<IsoDate, number>();
    for (const [key, value] of lastPerClusterPerDay) {
      const day = key.split('|')[0] as IsoDate;
      totals.set(day, (totals.get(day) ?? 0) + value.caseSize);
    }

    const points = [...totals.entries()]
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return AnalyticsController.chart('7.3.1', points, points.length, MINIMUM_DAYS_FOR_A_TREND, 'days of cluster history');
  }

  /**
   * 7.3.2 — the distribution across the three tiers. The one chart that already existed, kept here
   * so the five are read and authorised together rather than one of them living somewhere else.
   */
  async tierDistribution(): Promise<Chart<Record<PriorityTier, number>>> {
    const latest = await this.scores.latest();
    const distribution: Record<PriorityTier, number> = {
      [PriorityTier.High]: 0,
      [PriorityTier.Medium]: 0,
      [PriorityTier.Low]: 0,
    };
    // 7.3.2 says the distribution of **active** clusters, and `scores.latest()` is the latest score
    // per cluster including the ones 1.1.10 has since closed. Counted unscoped, this chart can only
    // ever grow: every closure leaves its last score behind, so the tiers accumulate a permanent
    // sediment of clusters that no longer exist and the total drifts away from the cluster count on
    // every other screen. The same defect was found and fixed in `DashboardController`; this is the
    // second copy of it, which the first fix did not reach.
    const activeIds = new Set((await this.clusters.findActive()).map((cluster) => cluster.id));
    let counted = 0;
    for (const score of latest) {
      if (activeIds.has(score.clusterId)) {
        distribution[score.tier] += 1;
        counted += 1;
      }
    }
    // Needs no history at all — it is a picture of the last scoring cycle — so the only way it can
    // be insufficient is if that cycle has not run over anything that is still open.
    return {
      requirement: '7.3.2',
      points: distribution,
      sufficient: counted > 0,
      insufficientReason:
        counted > 0
          ? null
          : latest.length === 0
            ? 'no scoring cycle has completed yet'
            : 'every cluster that has been scored has since been closed',
    };
  }

  /**
   * 7.3.3 — open work orders per Cleaning Crew Member.
   *
   * Crew members with **zero** open orders cannot appear here, and that is a stated limitation
   * rather than an oversight: this class has no account store, and inventing an empty row for every
   * id it happens to have seen would be a different chart. The unassigned bucket *is* included —
   * work that belongs to nobody is the thing a workload chart most needs to show.
   */
  async crewWorkload(): Promise<Chart<CrewLoad[]>> {
    if (this.workOrders === null) {
      return AnalyticsController.unwired('7.3.3', [] as CrewLoad[], 'work orders are not wired in');
    }
    const counts = new Map<Uuid | null, number>();
    for (const workOrder of await this.workOrders.findAllOpen()) {
      counts.set(workOrder.assigneeId, (counts.get(workOrder.assigneeId) ?? 0) + 1);
    }
    const points = [...counts.entries()]
      .map(([crewId, openWorkOrders]) => ({ crewId, openWorkOrders }))
      .sort((a, b) => b.openWorkOrders - a.openWorkOrders);
    // No open work at all is a real and readable answer, not an insufficient one.
    return { requirement: '7.3.3', points, sufficient: true, insufficientReason: null };
  }

  /**
   * 7.3.4 — median hours from creation to verified completion over the preceding 30 days.
   *
   * Median rather than mean, as the requirement says, and the reason is worth keeping: one work
   * order left open over a public holiday drags a mean of six far more than it drags a median, and
   * the number is read as "how long a job takes", which is a typical case and not an average one.
   * The fastest and slowest are returned alongside so that a median of 30 hours over a 4-to-300
   * spread cannot be read as consistency.
   */
  async turnaround(now = new Date()): Promise<Chart<TurnaroundSummary>> {
    const empty: TurnaroundSummary = { medianHours: null, sampleSize: 0, fastestHours: null, slowestHours: null };
    if (this.workOrders === null) {
      return AnalyticsController.unwired('7.3.4', empty, 'work orders are not wired in');
    }
    const since = AnalyticsController.windowStart(now);
    const hours: number[] = [];
    for (const workOrder of await this.workOrders.findVerifiedSince(since)) {
      if (workOrder.verifiedAt === null || workOrder.createdAt === undefined) {
        continue;
      }
      hours.push((workOrder.verifiedAt.getTime() - workOrder.createdAt.getTime()) / 3_600_000);
    }
    hours.sort((a, b) => a - b);

    const summary: TurnaroundSummary = {
      medianHours: AnalyticsController.median(hours),
      sampleSize: hours.length,
      fastestHours: hours[0] ?? null,
      slowestHours: hours[hours.length - 1] ?? null,
    };
    return AnalyticsController.chart(
      '7.3.4',
      summary,
      hours.length,
      MINIMUM_SAMPLES_FOR_A_MEDIAN,
      'verified work orders in the last 30 days',
    );
  }

  /**
   * 7.3.5 — reports received per day over the preceding 30 days.
   *
   * Every report, whatever its moderation outcome: this chart is about how much the public is
   * telling us, and filtering to verified ones would turn a demand curve into a moderation curve.
   *
   * Unlike 7.3.1, a day with no reports is a **real zero** and is included. Nobody reported
   * anything that Tuesday is a fact about the world; no snapshot was taken that Tuesday is a fact
   * about the scheduler, and the two must not be drawn the same way.
   */
  async reportsPerDay(now = new Date()): Promise<Chart<DailyPoint[]>> {
    if (this.reports === null) {
      return AnalyticsController.unwired('7.3.5', [] as DailyPoint[], 'reports are not wired in');
    }
    const since = AnalyticsController.windowStart(now);
    const counts = new Map<IsoDate, number>();
    for (const report of await this.reports.submittedSince(since)) {
      const day = AnalyticsController.dayOf(report.submittedAt);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }

    const points: DailyPoint[] = [];
    let daysWithReports = 0;
    for (let offset = ANALYTICS_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
      const day = AnalyticsController.dayOf(new Date(now.getTime() - offset * 86_400_000));
      const value = counts.get(day) ?? 0;
      if (value > 0) {
        daysWithReports += 1;
      }
      points.push({ date: day, value });
    }
    return AnalyticsController.chart('7.3.5', points, daysWithReports, 1, 'days on which any report was filed');
  }

  /** The Singapore calendar date of an instant. A UTC date is wrong for eight hours in every day. */
  private static dayOf(instant: Date): IsoDate {
    return singaporeDate(instant);
  }

  private static windowStart(now: Date): Date {
    return new Date(now.getTime() - ANALYTICS_WINDOW_DAYS * 86_400_000);
  }

  /** The lower of the two middle values is not taken: an even sample averages the middle pair. */
  private static median(sorted: number[]): number | null {
    if (sorted.length === 0) {
      return null;
    }
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
      ? (sorted[middle] as number)
      : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
  }

  private static chart<T>(requirement: string, points: T, have: number, need: number, unit: string): Chart<T> {
    const sufficient = have >= need;
    return {
      requirement,
      points,
      sufficient,
      insufficientReason: sufficient ? null : `${have} of ${need} ${unit} — too little to read as a trend`,
    };
  }

  /** A chart whose source is not wired is insufficient, never empty-and-fine (the 7.5.3 argument). */
  private static unwired<T>(requirement: string, points: T, reason: string): Chart<T> {
    return { requirement, points, sufficient: false, insufficientReason: reason };
  }
}
