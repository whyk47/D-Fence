/**
 * D-Fence — RainfallFeedParser.
 * Stereotype: <<control>>. Traces: 1.2.2, 1.2.3, 1.2.4.
 *
 * Pure functions over the data.gov.sg real-time rainfall payload (v2), verified live 2026-09-03:
 *
 *   { code, data: { stations[{id, deviceId, name, location{latitude, longitude}}],
 *                   readings[{timestamp, data[{stationId, value}]}],
 *                   readingType: "TB1 Rainfall 5 Minute Total F", readingUnit: "mm",
 *                   paginationToken? } }
 *
 * **Two facts worth recording.** The endpoint reports **87** stations, not the 97 in
 * `research/API-INVENTORY.md` — the count is not a constant and nothing should assume it. And each
 * `value` is a **5-minute total in millimetres**, not a rate, which is what makes 1.2.7's rolling
 * accumulation a plain sum rather than an integration over time.
 */
import { GeoPoint } from '../../entity/valueTypes';

export interface RawRainfallPayload {
  data?: {
    stations?: Array<{ id?: string; deviceId?: string; name?: string; location?: { latitude?: number; longitude?: number } }>;
    readings?: Array<{ timestamp?: string; data?: Array<{ stationId?: string; value?: number }> }>;
    readingUnit?: string;
    paginationToken?: string;
  };
}

export interface ParsedStation {
  stationId: string;
  name: string;
  point: GeoPoint;
}

export interface ParsedReading {
  stationId: string;
  readingAt: Date;
  valueMm: number;
}

export class RainfallFeedParser {
  /** 1.2.2 — station id, name, latitude, longitude. A station without coordinates is unusable
   *  for 1.2.5's nearest-three calculation, so it is dropped rather than defaulted to (0, 0). */
  static parseStations(payload: RawRainfallPayload): ParsedStation[] {
    return (payload.data?.stations ?? [])
      .filter((s) => s.location?.latitude !== undefined && s.location?.longitude !== undefined)
      .map((s) => ({
        stationId: String(s.id ?? s.deviceId ?? ''),
        name: s.name ?? '',
        point: new GeoPoint(Number(s.location?.latitude), Number(s.location?.longitude)),
      }))
      .filter((s) => s.stationId !== '');
  }

  /**
   * 1.2.3 — one reading per station per timestamp block.
   * A `value` that is absent is not zero: a station that reported nothing is not a station that
   * reported no rain, and treating them alike would understate an accumulation.
   */
  static parseReadings(payload: RawRainfallPayload): ParsedReading[] {
    const out: ParsedReading[] = [];
    for (const block of payload.data?.readings ?? []) {
      const at = block.timestamp === undefined ? null : new Date(block.timestamp);
      if (at === null || Number.isNaN(at.getTime())) {
        continue;
      }
      for (const entry of block.data ?? []) {
        if (entry.stationId === undefined || entry.value === undefined || Number.isNaN(Number(entry.value))) {
          continue;
        }
        out.push({ stationId: entry.stationId, readingAt: at, valueMm: Number(entry.value) });
      }
    }
    return out;
  }

  /**
   * 1.2.4 — discard anything more than 30 minutes older than the retrieval time.
   * Applies to the *live* cycle only. A deliberate historical backfill passes its own window, which
   * is why the cut-off is a parameter rather than a constant read from the clock.
   */
  static freshOnly(readings: ParsedReading[], retrievedAt: Date, maxAgeMinutes = 30): ParsedReading[] {
    const floor = retrievedAt.getTime() - maxAgeMinutes * 60_000;
    return readings.filter((r) => r.readingAt.getTime() >= floor);
  }

  /** The continuation token for a `?date=` query; absent on the last page. */
  static paginationToken(payload: RawRainfallPayload): string | null {
    return payload.data?.paginationToken ?? null;
  }
}
