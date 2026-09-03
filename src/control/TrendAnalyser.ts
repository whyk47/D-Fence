/**
 * D-Fence — case-size history and trajectory.
 * Stereotype: <<control>>. Traces: 9.1.9, 9.1.10, 1.1.8.
 *
 * `classify` is a **pure function of a series**, with no store, no clock and no cluster. That is
 * deliberate: 9.1.10 is the one piece of §9 that makes a judgement rather than displaying a fact,
 * and a judgement that cannot be tested at its boundaries is a judgement nobody can defend in a
 * viva. Everything that needs a database lives in the methods around it.
 */
import { Trajectory } from '../entity/enums';
import { IsoDate, Uuid, singaporeDate as toSingaporeDate } from '../entity/valueTypes';
import { ClusterStore } from '../ports/Stores';

/** One point of the 9.1.9 series: a calendar date and the case size observed that day. */
export interface SeriesPoint {
  date: IsoDate;
  caseSize: number;
}

/** 9.1.9 */
export const SERIES_DAYS = 30;
/** 9.1.10 */
export const TRAJECTORY_DAYS = 14;

/**
 * How much a cluster must move across the window before it is Growing or Receding rather than
 * Stable, as a share of where it started.
 *
 * A judgement, and recorded as one: 9.1.10 names three classes and does not say where the lines
 * fall. Ten per cent over a fortnight is a change a manager would act on; below that, on a cluster
 * of a dozen cases, one late-reported case would flip the label every other day and the trend
 * column would stop meaning anything.
 */
export const TRAJECTORY_BAND = 0.1;

export class TrendAnalyser {
  constructor(private readonly clusters: ClusterStore) {}

  /**
   * 9.1.9 — the case-size series for the preceding `days`, one point per calendar day.
   *
   * The feed is polled hourly and republished daily, so a naive series would carry two dozen
   * identical points per day. One point per day, taking the **last** observation of each, is what
   * a 30-day chart means; taking the first would show yesterday's number under today's date.
   */
  async caseSeries(clusterId: Uuid, days = SERIES_DAYS, now = new Date()): Promise<SeriesPoint[]> {
    const since = new Date(now.getTime() - days * 86_400_000);
    const snapshots = (await this.clusters.snapshotsSince(clusterId, since)).sort(
      (a, b) => a.retrievedAt.getTime() - b.retrievedAt.getTime(),
    );
    const byDay = new Map<IsoDate, number>();
    for (const snapshot of snapshots) {
      byDay.set(TrendAnalyser.singaporeDate(snapshot.retrievedAt), snapshot.caseSize);
    }
    return [...byDay.entries()].map(([date, caseSize]) => ({ date, caseSize }));
  }

  /** 9.1.10 — the trajectory over the preceding fourteen days. */
  async trajectoryOf(clusterId: Uuid, now = new Date()): Promise<Trajectory> {
    return TrendAnalyser.classify(await this.caseSeries(clusterId, TRAJECTORY_DAYS, now));
  }

  /**
   * 9.1.10 — Growing, Stable or Receding from the case sizes in the window.
   *
   * Compares the **ends** of the series, not consecutive points: a cluster that rises, falls and
   * rises again over a fortnight has grown, and a rule that looked at the last step alone would
   * call that Receding on the strength of one quiet Tuesday.
   *
   * A series that cannot support a judgement returns Stable, and that is the honest answer rather
   * than a hedge: with one observation there is no trend to report, and Stable is what a reader
   * takes "no visible movement" to mean. It is why the dashboard shows the series alongside the
   * label rather than the label alone.
   */
  static classify(series: SeriesPoint[]): Trajectory {
    if (series.length < 2) {
      return Trajectory.Stable;
    }
    const first = (series[0] as SeriesPoint).caseSize;
    const last = (series[series.length - 1] as SeriesPoint).caseSize;
    if (first === 0) {
      // A cluster that started the window at zero and has cases now is growing by any reading; the
      // percentage is undefined, so it is answered by the absolute change instead.
      return last > 0 ? Trajectory.Growing : Trajectory.Stable;
    }
    const change = (last - first) / first;
    if (change >= TRAJECTORY_BAND) {
      return Trajectory.Growing;
    }
    return change <= -TRAJECTORY_BAND ? Trajectory.Receding : Trajectory.Stable;
  }

  /** The calendar date in Singapore. A day boundary at 00:00 UTC would split a Singapore evening. */
  static singaporeDate(at: Date): IsoDate {
    return toSingaporeDate(at);
  }
}
