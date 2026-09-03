/**
 * D-Fence — the health of every external data source.
 * Stereotype: <<control>>. Traces: 1.4.1, 1.4.2, 1.4.3, 1.4.4, 3.1.16, 7.5.1, 10.2.2.
 *
 * Split out of `DashboardController` because 1.4.x is a feature of its own and was being answered
 * by four lines inside a dashboard method that got two things wrong:
 *
 *  1. **It warned after ONE failed run.** 1.4.3 says three consecutive scheduled intervals. A
 *     public API returning a 503 once is normal; warning on it trains a manager to ignore the
 *     panel, which is the failure mode that matters — an alarm nobody reads is worse than no alarm.
 *  2. **It reported two sources out of four.** Clusters and rainfall were listed; the forecast and
 *     the geocoder were not, so 1.4.1's "every external data source" was two-thirds true. A source
 *     missing from a health panel does not look unhealthy, it looks fine.
 *
 * **Two conditions, not one.** A source is warned on when *either* its three most recent runs all
 * failed, *or* nothing has succeeded for three of its scheduled intervals. Both are needed and
 * neither implies the other: a source that fails three times has three FAILED rows, but a source
 * whose scheduler has stopped firing altogether has **no rows at all** — and that is the outage a
 * failure counter is structurally unable to see.
 */
import { SourceKind } from '../entity/enums';
import { SourceHealth } from '../entity/SourceHealth';
import { IngestionRunStore } from '../ports/Stores';

/** 1.4.3's number, named rather than inlined: the requirement is the reason it is three. */
export const CONSECUTIVE_FAILURES_FOR_WARNING = 3;

/** Fallbacks, in seconds, for a source with no configured interval. Clusters 1.1.1, rainfall
 *  1.2.1, forecast 1.3.1, geocoding token 3.1.15. */
const DEFAULT_INTERVAL_SECONDS: Record<SourceKind, number> = {
  [SourceKind.Clusters]: 3_600,
  [SourceKind.Rainfall]: 300,
  [SourceKind.Forecast]: 6 * 3_600,
  [SourceKind.Geocoding]: 48 * 3_600,
};

/** What 1.4.2 displays and 1.4.4 keys off, per source. */
export interface SourceHealthRow {
  source: SourceKind;
  /** 1.4.1 — null when the source has never succeeded, which is not the same as "long ago". */
  lastSuccessAt: Date | null;
  /** 1.4.3 — three consecutive failed intervals. */
  isWarning: boolean;
  /**
   * 1.4.4 — the data this source produced is older than one of its own intervals, so any screen
   * presenting it must say so. Deliberately a **lower bar** than `isWarning`: one missed cycle is
   * worth a marker on the data and is not worth an alarm on the panel.
   */
  isStale: boolean;
  /** Why, in the manager's words. 10.5.3 wants a cause, not a boolean. */
  reason: string;
  /** How many of the most recent runs failed in an unbroken run from the newest. */
  consecutiveFailures: number;
}

/** What a non-ingesting source (the geocoder) can report about itself. 3.1.16. */
export interface SelfReportingSource {
  health(): { source: SourceKind; healthy: boolean; detail: string | null; since: Date | null };
  lastSuccessAt(): Date | null;
}

export class SourceHealthController {
  constructor(
    private readonly runs: IngestionRunStore,
    /** From `ConfigSet.ingestionIntervals` (10.6.2) — the schedule 1.4.3 counts intervals of. */
    private readonly intervalsSeconds: ReadonlyMap<SourceKind, number> = new Map(),
    /**
     * The geocoder answers for itself. It has no ingestion job — it is called when a resident saves
     * an address (3.1.3) and on a 48-hour token schedule (3.1.15) — so writing an IngestionRun per
     * lookup would fill the run table with user traffic to answer a question the controller can
     * already answer directly.
     */
    private readonly geocoding: SelfReportingSource | null = null,
  ) {}

  /** 1.4.1, 1.4.2 — every external source, whether or not it has ever run. */
  async report(now = new Date()): Promise<SourceHealthRow[]> {
    const rows: SourceHealthRow[] = [];
    for (const source of [SourceKind.Clusters, SourceKind.Rainfall, SourceKind.Forecast]) {
      rows.push(await this.ingesting(source, now));
    }
    rows.push(this.selfReported(now));
    return rows;
  }

  /** The same rows as entities, for anything that stores or serialises them. */
  async asEntities(now = new Date()): Promise<SourceHealth[]> {
    return (await this.report(now)).map((row) => {
      const health = new SourceHealth();
      health.source = row.source;
      health.lastSuccessAt = row.lastSuccessAt;
      health.isWarning = row.isWarning;
      return health;
    });
  }

  /** 1.4.4 — whether a named source's data should carry the staleness indicator. */
  async isStale(source: SourceKind, now = new Date()): Promise<boolean> {
    return (await this.report(now)).find((r) => r.source === source)?.isStale ?? true;
  }

  private intervalMs(source: SourceKind): number {
    return (this.intervalsSeconds.get(source) ?? DEFAULT_INTERVAL_SECONDS[source]) * 1000;
  }

  private async ingesting(source: SourceKind, now: Date): Promise<SourceHealthRow> {
    // Enough history to see three failures and the success before them. UNCHANGED counts as a
    // success (1.1.21): a publisher that published nothing is evidence the source is alive, and
    // 1.4.x must not call a healthy feed stale because NEA had a quiet hour.
    const recent = await this.runs.recentRuns(source, 10);
    const settled = recent.filter((run) => run.outcome !== 'RUNNING');
    const lastSuccess = settled.find((run) => run.outcome === 'SUCCESS' || run.outcome === 'UNCHANGED');
    const lastSuccessAt = lastSuccess?.endedAt ?? null;

    let consecutiveFailures = 0;
    for (const run of settled) {
      if (run.outcome !== 'FAILED') {
        break;
      }
      consecutiveFailures += 1;
    }

    const interval = this.intervalMs(source);
    const silentFor = lastSuccessAt === null ? null : now.getTime() - lastSuccessAt.getTime();
    const missedIntervals = silentFor === null ? null : Math.floor(silentFor / interval);

    // Never run at all is its own state. It is not a warning on a fresh deployment — the first
    // cycle has simply not happened — but it is certainly stale, because there is no data yet.
    if (settled.length === 0) {
      return {
        source,
        lastSuccessAt: null,
        isWarning: false,
        isStale: true,
        reason: 'has not run yet',
        consecutiveFailures: 0,
      };
    }

    const failedThrice = consecutiveFailures >= CONSECUTIVE_FAILURES_FOR_WARNING;
    const silentThroughThree =
      lastSuccessAt === null
        ? true // it has run, and never once succeeded
        : (missedIntervals as number) >= CONSECUTIVE_FAILURES_FOR_WARNING;

    return {
      source,
      lastSuccessAt,
      isWarning: failedThrice || silentThroughThree,
      isStale: lastSuccessAt === null || (silentFor as number) > interval,
      reason: SourceHealthController.reasonFor(consecutiveFailures, lastSuccessAt, missedIntervals),
      consecutiveFailures,
    };
  }

  private static reasonFor(
    consecutiveFailures: number,
    lastSuccessAt: Date | null,
    missedIntervals: number | null,
  ): string {
    if (lastSuccessAt === null) {
      return 'has never completed a successful retrieval';
    }
    if (consecutiveFailures >= CONSECUTIVE_FAILURES_FOR_WARNING) {
      return `${consecutiveFailures} consecutive failed retrievals since ${lastSuccessAt.toISOString()}`;
    }
    if ((missedIntervals ?? 0) >= CONSECUTIVE_FAILURES_FOR_WARNING) {
      // The case a failure counter cannot see: no failures, because nothing ran.
      return `no retrieval attempt has succeeded for ${missedIntervals} scheduled intervals`;
    }
    if (consecutiveFailures > 0) {
      return `${consecutiveFailures} failed retrieval(s), last success ${lastSuccessAt.toISOString()}`;
    }
    return `last succeeded ${lastSuccessAt.toISOString()}`;
  }

  /**
   * 3.1.16 — the geocoder, which reports its own health because it has no ingestion job.
   *
   * Absent entirely (no OneMap wired), it is reported as never-run rather than omitted: 1.4.1 says
   * *every* external source, and a source missing from the panel reads as a source that is fine.
   */
  private selfReported(now: Date): SourceHealthRow {
    const source = SourceKind.Geocoding;
    if (this.geocoding === null) {
      return {
        source,
        lastSuccessAt: null,
        isWarning: false,
        isStale: true,
        reason: 'not configured',
        consecutiveFailures: 0,
      };
    }
    const health = this.geocoding.health();
    const lastSuccessAt = this.geocoding.lastSuccessAt();
    const interval = this.intervalMs(source);
    const silentFor = lastSuccessAt === null ? null : now.getTime() - lastSuccessAt.getTime();
    return {
      source,
      lastSuccessAt,
      // An authentication failure is a warning on its own: unlike a 503, a lapsed token does not
      // clear itself, and 3.1.16 exists because the token has a hard expiry date on it.
      isWarning: !health.healthy || (silentFor !== null && silentFor >= CONSECUTIVE_FAILURES_FOR_WARNING * interval),
      isStale: lastSuccessAt === null || (silentFor as number) > interval,
      reason: health.healthy
        ? lastSuccessAt === null
          ? 'configured, but has not been used yet'
          : `last succeeded ${lastSuccessAt.toISOString()}`
        : `authentication failing since ${health.since?.toISOString() ?? 'an unknown time'}: ${health.detail ?? 'no detail'}`,
      consecutiveFailures: health.healthy ? 0 : CONSECUTIVE_FAILURES_FOR_WARNING,
    };
  }
}
