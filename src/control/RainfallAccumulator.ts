/**
 * D-Fence — RainfallAccumulator.
 * Stereotype: <<control>>. Traces: 1.2.5, 1.2.6, 1.2.7, 1.2.8, 1.2.9, 1.2.10, 10.2.2.
 *
 * Turns 87 point stations into a rainfall figure per cluster. Three rules, in order:
 *
 * - **1.2.5** the three nearest stations to the cluster centroid, by great-circle distance
 * - **1.2.6** an inverse-distance-weighted mean of those three, so a station 400 m away counts for
 *   more than one 6 km away — an unweighted mean of three stations would let a distant dry gauge
 *   cancel a close wet one
 * - **1.2.7 / 1.2.8** rolling 24-hour and 72-hour totals, in millimetres to one decimal place
 *
 * The readings are 5-minute *totals* (the feed's own `readingType` says so), which is why an
 * accumulation is a sum and not an integration.
 *
 * **A window is reported with the span of history behind it, and a short span is not a measurement.**
 * `windowTotal` has always returned null for a window with nothing in it, and the reason is written
 * three lines below its signature: scoring an absent driver as zero reads as "no rain here" when
 * the truth is "we do not know". `accumulate` then wrote `?? 0` over both, which threw that
 * distinction away at the only place it could have been used. Worse, it could not have caught the
 * case that actually occurred: a deployment 26 hours old has readings, so the window is not empty,
 * and a 72-hour total computed across 26 hours of history was published as a complete one.
 */
import { GeoPoint } from '../entity/valueTypes';
import { ClusterRainfall } from '../entity/ClusterRainfall';
import { ParsedReading, ParsedStation } from './ingestion/RainfallFeedParser';

export interface StationDistance {
  stationId: string;
  metres: number;
}

/**
 * One station's windows, already summed — the same six numbers `accumulate` derives from tens of
 * thousands of individual readings.
 *
 * **Why this type exists.** `accumulate` needs, per station, four sums and two timestamps. It was
 * getting them by reading every reading in the 72-hour window out of the database and summing them
 * in Node: 66,866 rows per cycle, 288 cycles a day, to produce 88 × 6 numbers. That is the whole of
 * the Supabase egress overrun — roughly 3.2 MB a cycle, 900 MB a day, and it also meant a resident
 * opening a saved location pulled 3.2 MB to find out whether it had rained at their block.
 *
 * A total is `null`, never `0`, when the station reported nothing in that window. The distinction is
 * the same one `windowTotal` has always made and for the same reason: a station that reported no
 * rain and a station that reported nothing at all are different facts, and 4.1.12 excludes the
 * second rather than scoring it as dry.
 */
export interface StationWindow {
  stationId: string;
  /** 1.2.7 */
  total24hMm: number | null;
  /** 1.2.8 */
  total72hMm: number | null;
  /** The most recent five minutes, for the current-rate display. */
  currentMm: number | null;
  /** Oldest and newest reading held for this station inside the 72-hour window. */
  oldestReadingAt: Date;
  newestReadingAt: Date;
}

/** A window's total, and how much of the window there was any data for. */
export interface WindowTotal {
  totalMm: number;
  /** From the oldest reading inside the window to `now`. Never more than the window itself. */
  observedHours: number;
}

/**
 * The share of a window that must have readings behind it before its total is treated as a
 * measurement rather than as a lower bound.
 *
 * Three quarters. Not a round number chosen for looking decisive: below this, the missing quarter
 * could hold a downpour large enough to move the driver across its whole normalised range, so the
 * total would not merely be imprecise — it could be wrong in the direction that matters, reporting
 * a dry cluster as dry when it was the one that flooded.
 *
 * The consequence is bounded and self-healing. 4.1.19 redistributes an excluded driver's weight
 * across the drivers that remain, and a deployment crosses 75% of the 72-hour window after two and
 * a quarter days, after which the driver returns on its own with no intervention.
 */
export const MINIMUM_WINDOW_COVERAGE = 0.75;

export class RainfallAccumulator {
  /**
   * @param stalenessMinutes 1.2.10 — no accepted reading for this long marks rainfall stale, which
   *   4.1.12 then excludes from the score rather than scoring the cluster as dry.
   */
  constructor(private readonly stalenessMinutes = 30) {}

  /** 1.2.5 — the three nearest stations, nearest first. Ties broken by station id so the choice is
   *  stable between cycles; an unstable assignment would make a cluster's rainfall jitter. */
  nearestStations(centroid: GeoPoint, stations: ParsedStation[], count = 3): StationDistance[] {
    return stations
      .map((s) => ({ stationId: s.stationId, metres: centroid.distanceTo(s.point) }))
      .sort((a, b) => (a.metres === b.metres ? a.stationId.localeCompare(b.stationId) : a.metres - b.metres))
      .slice(0, count);
  }

  /**
   * 1.2.6 — inverse-distance-weighted mean.
   * A station exactly at the centroid would divide by zero, so a distance below one metre takes the
   * station's value outright: at that range interpolation has nothing left to add.
   */
  inverseDistanceWeightedMean(values: Map<string, number>, nearest: StationDistance[]): number | null {
    const usable = nearest.filter((n) => values.has(n.stationId));
    if (usable.length === 0) {
      return null;
    }
    const exact = usable.find((n) => n.metres < 1);
    if (exact !== undefined) {
      return values.get(exact.stationId) as number;
    }
    let weighted = 0;
    let weight = 0;
    for (const station of usable) {
      const w = 1 / station.metres;
      weighted += (values.get(station.stationId) as number) * w;
      weight += w;
    }
    return weighted / weight;
  }

  /**
   * 1.2.7 / 1.2.8 — the rolling totals for one cluster.
   *
   * @param readings every reading held for the window, any station
   * @param now the cycle time; windows are measured back from here, not from the newest reading,
   *   because a feed that stopped an hour ago must produce a *falling* accumulation, not a frozen one
   * @returns null for a window with no usable reading at all — never 0. 4.1.12 excludes an absent
   *   driver; scoring it as zero would read as "no rain here" when the truth is "we do not know".
   */
  accumulate(
    centroid: GeoPoint,
    stations: ParsedStation[],
    readings: ParsedReading[],
    now: Date,
  ): ClusterRainfall {
    const nearest = this.nearestStations(centroid, stations);
    const ids = new Set(nearest.map((n) => n.stationId));
    const relevant = readings.filter((r) => ids.has(r.stationId));

    const in24 = this.windowTotalWithCoverage(relevant, nearest, now, 24);
    const in72 = this.windowTotalWithCoverage(relevant, nearest, now, 72);

    const result = new ClusterRainfall();
    // The `?? 0` stays on the millimetre fields, because they are typed `number` and every caller
    // reads them for display. What no longer happens is the *coverage* being lost with it: a caller
    // deciding whether to score on this can now tell 0 mm measured over three days from 0 mm
    // measured over one, and `sufficientFor` below is how it asks.
    result.accum24hMm = in24?.totalMm ?? 0;
    result.accum72hMm = in72?.totalMm ?? 0;
    result.observed24hHours = in24?.observedHours ?? 0;
    result.observed72hHours = in72?.observedHours ?? 0;
    result.currentMm = this.windowTotal(relevant, nearest, now, 1 / 12) ?? 0; // the last 5 minutes
    result.isStale = this.isStale(relevant, now);
    return result;
  }

  /**
   * 1.2.5–1.2.10 for one cluster, from per-station sums the database computed.
   *
   * Identical in result to `accumulate` — `rainfall.test.ts` asserts that directly — and different
   * only in what it had to be handed to get there. `accumulate` remains because the two must be
   * shown to agree, and because a caller holding readings in memory (the ingestion path, the
   * fixtures) should not have to aggregate them first.
   *
   * @param windows every station's windows; stations other than the nearest three are ignored here
   *   rather than filtered by the caller, so a caller cannot get the 1.2.5 selection wrong.
   */
  accumulateWindows(
    centroid: GeoPoint,
    stations: ParsedStation[],
    windows: StationWindow[],
    now: Date,
  ): ClusterRainfall {
    const nearest = this.nearestStations(centroid, stations);
    const ids = new Set(nearest.map((n) => n.stationId));
    const relevant = windows.filter((w) => ids.has(w.stationId));

    const mean = (pick: (w: StationWindow) => number | null): number | null => {
      const values = new Map<string, number>();
      for (const window of relevant) {
        const value = pick(window);
        if (value !== null) {
          values.set(window.stationId, value);
        }
      }
      if (values.size === 0) {
        return null;
      }
      const interpolated = this.inverseDistanceWeightedMean(values, nearest);
      return interpolated === null ? null : Math.round(interpolated * 10) / 10;
    };

    const in24 = mean((w) => w.total24hMm);
    const in72 = mean((w) => w.total72hMm);

    const result = new ClusterRainfall();
    result.accum24hMm = in24 ?? 0;
    result.accum72hMm = in72 ?? 0;
    // Coverage is the span of history held, capped at the window — the reasoning is on
    // `windowTotalWithCoverage` and is unchanged. A window with no total at all has no coverage
    // either, which is what keeps `sufficientFor` excluding it rather than reporting nought hours
    // of a total that does not exist.
    const oldest = relevant.length === 0 ? null : Math.min(...relevant.map((w) => w.oldestReadingAt.getTime()));
    const span = oldest === null ? 0 : (now.getTime() - oldest) / 3_600_000;
    result.observed24hHours = in24 === null ? 0 : Math.min(24, span);
    result.observed72hHours = in72 === null ? 0 : Math.min(72, span);
    result.currentMm = mean((w) => w.currentMm) ?? 0;
    result.isStale = this.isStaleAt(relevant, now);
    return result;
  }

  /** 1.2.10, against per-station windows rather than raw readings. */
  isStaleAt(windows: StationWindow[], now: Date): boolean {
    if (windows.length === 0) {
      return true;
    }
    const newest = Math.max(...windows.map((w) => w.newestReadingAt.getTime()));
    return now.getTime() - newest > this.stalenessMinutes * 60_000;
  }

  /**
   * 4.1.12, 4.1.20 — whether a window's total may be scored on, or must be excluded and named.
   *
   * @param observedHours what `accumulate` recorded for the window
   * @param windowHours the window it was recorded for
   */
  static sufficientFor(observedHours: number, windowHours: number): boolean {
    return observedHours >= windowHours * MINIMUM_WINDOW_COVERAGE;
  }

  /** 10.5.3 — the sentence that goes with an exclusion, in the units a reader thinks in. */
  static coverageReason(observedHours: number, windowHours: number): string {
    return `${observedHours.toFixed(1)} of ${windowHours} hours of rainfall history — too little to report as a ${windowHours}-hour total`;
  }

  /** As `windowTotal`, and also says how much of the window had readings behind it. */
  windowTotalWithCoverage(
    readings: ParsedReading[],
    nearest: StationDistance[],
    now: Date,
    hours: number,
  ): WindowTotal | null {
    const total = this.windowTotal(readings, nearest, now, hours);
    if (total === null) {
      return null;
    }
    /**
     * Coverage is how far the stored history reaches, capped at the window — **not** the span of
     * the readings that happen to fall inside it.
     *
     * The distinction is not pedantic; the first draft of this used the in-window span and got the
     * answer backwards. Take a store holding readings from 26 hours ago and from five minutes ago.
     * Inside the 24-hour window there is only the recent one, so an in-window span reports five
     * minutes of coverage and declares the 24-hour driver unusable — when in fact the history
     * covers that window completely and the total is sound. A gap between readings is a gap; it is
     * not evidence that the period before the gap is unobserved.
     *
     * What the caller is actually asking is "how much of this window does our data reach back
     * across", and that is a property of the oldest reading held, wherever it falls.
     */
    const oldest = Math.min(...readings.map((r) => r.readingAt.getTime()));
    const observedHours = Math.min(hours, (now.getTime() - oldest) / 3_600_000);
    return { totalMm: total, observedHours };
  }

  /** @returns the interpolated total over the window, or null when no station reported in it. */
  windowTotal(
    readings: ParsedReading[],
    nearest: StationDistance[],
    now: Date,
    hours: number,
  ): number | null {
    const floor = now.getTime() - hours * 3_600_000;
    const perStation = new Map<string, number>();
    for (const reading of readings) {
      const t = reading.readingAt.getTime();
      if (t < floor || t > now.getTime()) {
        continue;
      }
      perStation.set(reading.stationId, (perStation.get(reading.stationId) ?? 0) + reading.valueMm);
    }
    if (perStation.size === 0) {
      return null;
    }
    const mean = this.inverseDistanceWeightedMean(perStation, nearest);
    return mean === null ? null : Math.round(mean * 10) / 10;
  }

  /** 1.2.10 — stale when nothing has been accepted for the staleness window. */
  isStale(readings: ParsedReading[], now: Date): boolean {
    if (readings.length === 0) {
      return true;
    }
    const newest = Math.max(...readings.map((r) => r.readingAt.getTime()));
    return now.getTime() - newest > this.stalenessMinutes * 60_000;
  }
}
