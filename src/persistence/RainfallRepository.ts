/**
 * D-Fence — RainfallRepository.
 * Stereotype: <<persistence>>. Traces: 1.2.1–1.2.4, 1.2.7, 1.2.8, 1.2.10.
 *
 * The one store where **idempotence is the requirement**, not a nicety. The rainfall feed is polled
 * every five minutes and a cold-start backfill walks 72 hours of overlapping pages, so the same
 * reading is offered many times. Counting it twice would inflate the 24- and 72-hour accumulations,
 * which feed drivers 4.1.x — a duplicate does not merely waste a row, it changes a cluster's rank.
 *
 * The primary key `(station_id, reading_at)` is what makes that impossible, and `ON CONFLICT DO
 * NOTHING` is what makes re-ingestion cheap rather than an error.
 */
import { Database, Row } from './Database';
import { GeoPoint } from '../entity/valueTypes';
import { ParsedReading, ParsedStation } from '../control/ingestion/RainfallFeedParser';
import { RainfallStore } from '../ports/Stores';

export class RainfallRepository implements RainfallStore {
  constructor(private readonly db: Database) {}

  /** 1.2.2 — the station list arrives with every readings payload, so this must be idempotent. */
  async saveStations(stations: ParsedStation[]): Promise<void> {
    if (stations.length === 0) {
      return;
    }
    await this.db.transaction(async (tx) => {
      for (const station of stations) {
        await tx.query(
          `INSERT INTO rainfall_station (station_id, name, point)
           VALUES ($1, $2, ST_MakePoint($4, $3)::geography)
           ON CONFLICT (station_id) DO UPDATE SET name = EXCLUDED.name, point = EXCLUDED.point`,
          [station.stationId, station.name, station.point.latitude, station.point.longitude],
        );
      }
    });
  }

  async stations(): Promise<ParsedStation[]> {
    const rows = await this.db.query(
      `SELECT station_id, name, ST_Y(point::geometry) AS lat, ST_X(point::geometry) AS lon FROM rainfall_station`,
    );
    return rows.map((r) => ({
      stationId: String(r.station_id),
      name: String(r.name),
      point: new GeoPoint(Number(r.lat), Number(r.lon)),
    }));
  }

  /**
   * @returns the number of readings **newly** stored. The count is what an IngestionRun reports
   *   (1.1.14), so it has to mean "new information", not "rows offered" — otherwise a backfill
   *   re-run reports thousands of features and nothing changed.
   */
  async saveReadings(readings: ParsedReading[]): Promise<number> {
    if (readings.length === 0) {
      return 0;
    }
    let written = 0;
    await this.db.transaction(async (tx) => {
      for (const reading of readings) {
        const rows = await tx.query(
          `INSERT INTO rainfall_reading (station_id, reading_at, value_mm) VALUES ($1, $2, $3)
           ON CONFLICT (station_id, reading_at) DO NOTHING
           RETURNING station_id`,
          [reading.stationId, reading.readingAt, reading.valueMm],
        );
        written += rows.length;
      }
    });
    return written;
  }

  /** Readings within the window, for the 1.2.7 and 1.2.8 accumulations. Inclusive of the cut-off. */
  async readingsSince(since: Date): Promise<ParsedReading[]> {
    const rows = await this.db.query(
      `SELECT station_id, reading_at, value_mm FROM rainfall_reading
        WHERE reading_at >= $1 ORDER BY reading_at`,
      [since],
    );
    return rows.map((r) => RainfallRepository.toReading(r));
  }

  /** 1.2.10 — the newest reading held, or null when nothing has ever been stored. */
  async newestReadingAt(): Promise<Date | null> {
    const rows = await this.db.query(`SELECT max(reading_at) AS newest FROM rainfall_reading`);
    return ((rows[0] as Row | undefined)?.newest as Date | null) ?? null;
  }

  private static toReading(row: Row): ParsedReading {
    return {
      stationId: String(row.station_id),
      readingAt: row.reading_at as Date,
      // numeric comes back from pg as a string, deliberately — it is arbitrary precision. Left
      // implicit it would concatenate rather than add, and a 72-hour accumulation would become a
      // very long string instead of a number.
      valueMm: Number(row.value_mm),
    };
  }
}
