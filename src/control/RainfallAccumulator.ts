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
 */
import { GeoPoint } from '../entity/valueTypes';
import { ClusterRainfall } from '../entity/ClusterRainfall';
import { ParsedReading, ParsedStation } from './ingestion/RainfallFeedParser';

export interface StationDistance {
  stationId: string;
  metres: number;
}

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

    const result = new ClusterRainfall();
    result.accum24hMm = this.windowTotal(relevant, nearest, now, 24) ?? 0;
    result.accum72hMm = this.windowTotal(relevant, nearest, now, 72) ?? 0;
    result.currentMm = this.windowTotal(relevant, nearest, now, 1 / 12) ?? 0; // the last 5 minutes
    result.isStale = this.isStale(relevant, now);
    return result;
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
