/**
 * D-Fence — SavedLocationRepository and AlertSubscriptionRepository.
 * Stereotype: <<persistence>>. Traces: 3.1.1, 3.1.8, 3.1.10, 3.1.11, 3.1.12, 6.1.1, 6.1.3, 10.2.3.
 *
 * §3 is the epic a restart hurt most. A resident saves their home, their child's school and their
 * workplace — three careful geocoding round trips through OneMap, each confirmed by hand — and an
 * `InMemorySavedLocationStore` threw all of it away the next time the container recycled. Azure
 * recycles a container for reasons that have nothing to do with this application, so "it survives
 * as long as nobody restarts anything" is not a property anyone can rely on, and 3.1.11's
 * five-location limit was being counted against a list that could silently empty.
 *
 * **The exposure evaluation is stored, not recomputed on read.** 3.1.10 shows the case size and the
 * data timestamp *as at the last evaluation*, and 3.1.8 evaluates on the ingestion cycle rather
 * than on the screen. Recomputing on read would put a PostGIS query behind every list, and — worse
 * — would make the card's "as at" timestamp a lie, since it would then always be now.
 *
 * `evaluated_at` is deliberately nullable and starts null. A location saved a moment ago has not
 * been evaluated, and defaulting it to `now()` would say "checked just now and found clear", which
 * is the one wrong answer worth ruling out.
 */
import { randomUUID } from 'node:crypto';
import { Database, Row } from './Database';
import { SavedLocation } from '../entity/SavedLocation';
import { AlertSubscription } from '../entity/AlertSubscription';
import { GeoPoint, Uuid } from '../entity/valueTypes';
import { AlertTrigger, ExposureStatus, LocationLabel } from '../entity/enums';
import { AlertSubscriptionStore, SavedLocationStore } from '../ports/Stores';

/** Every column, once, so a change to the table is a change in one place. */
const COLUMNS = `
  id, account_id, input_text, resolved_address, ST_AsGeoJSON(point) AS point, label, name,
  exposure_status, exposure_cluster_id, exposure_cluster_locality, exposure_case_size,
  exposure_distance_metres, exposure_data_timestamp, rain_24h_mm, rain_72h_mm, evaluated_at`;

export class SavedLocationRepository implements SavedLocationStore {
  constructor(private readonly db: Database) {}

  async findById(id: Uuid): Promise<SavedLocation | null> {
    const rows = await this.db.query(`SELECT ${COLUMNS} FROM saved_location WHERE id = $1`, [id]);
    return rows.length === 0 ? null : SavedLocationRepository.toLocation(rows[0] as Row);
  }

  /**
   * 2.3.1, 3.1.1 — a resident's own.
   *
   * Ordered by creation is not available (the table has no created_at), so it orders by name: a
   * stable order matters more than which one, because an unordered list re-shuffles itself between
   * two reads and a resident watching their own screen would see their locations move.
   */
  async findForAccount(accountId: Uuid): Promise<SavedLocation[]> {
    const rows = await this.db.query(
      `SELECT ${COLUMNS} FROM saved_location WHERE account_id = $1 ORDER BY name, id`,
      [accountId],
    );
    return rows.map((row) => SavedLocationRepository.toLocation(row));
  }

  /** Upsert by id, assigning one when absent — the same contract the in-memory store offers. */
  async save(location: SavedLocation): Promise<SavedLocation> {
    location.id = location.id || randomUUID();
    await this.db.query(
      `INSERT INTO saved_location (
         id, account_id, input_text, resolved_address, point, label, name, exposure_status,
         exposure_cluster_id, exposure_cluster_locality, exposure_case_size,
         exposure_distance_metres, exposure_data_timestamp, rain_24h_mm, rain_72h_mm, evaluated_at)
       VALUES ($1, $2, $3, $4, ST_MakePoint($6, $5)::geography, $7, $8, $9, $10, $11, $12, $13, $14,
               $15, $16, $17)
       ON CONFLICT (id) DO UPDATE SET
         account_id                = EXCLUDED.account_id,
         input_text                = EXCLUDED.input_text,
         resolved_address          = EXCLUDED.resolved_address,
         point                     = EXCLUDED.point,
         label                     = EXCLUDED.label,
         name                      = EXCLUDED.name,
         exposure_status           = EXCLUDED.exposure_status,
         exposure_cluster_id       = EXCLUDED.exposure_cluster_id,
         exposure_cluster_locality = EXCLUDED.exposure_cluster_locality,
         exposure_case_size        = EXCLUDED.exposure_case_size,
         exposure_distance_metres  = EXCLUDED.exposure_distance_metres,
         exposure_data_timestamp   = EXCLUDED.exposure_data_timestamp,
         rain_24h_mm               = EXCLUDED.rain_24h_mm,
         rain_72h_mm               = EXCLUDED.rain_72h_mm,
         evaluated_at              = EXCLUDED.evaluated_at`,
      [
        location.id,
        location.accountId,
        location.inputText,
        location.resolvedAddress,
        // `ST_MakePoint` takes (longitude, latitude). The parameters are numbered so the entity's
        // (latitude, longitude) order is preserved in this list and reversed once, here, where it
        // can be seen — rather than silently in the argument order, which is how a Singapore
        // address ends up in the Java Sea.
        location.point.latitude,
        location.point.longitude,
        location.label,
        location.name,
        location.exposureStatus,
        location.exposure.clusterId,
        location.exposure.clusterLocality,
        location.exposure.caseSize,
        location.exposure.distanceMetres,
        location.exposure.dataTimestamp,
        location.rain24hMm,
        location.rain72hMm,
        location.evaluatedAt,
      ],
    );
    return location;
  }

  /**
   * 3.1.12 — and the subscription goes with it, by the schema's `ON DELETE CASCADE`.
   *
   * The controller still asks `AlertSubscriptionStore.deleteForLocation` first, because it must
   * *report the count* to the resident and because the in-memory store has no cascade. Doing it in
   * both places is not duplication: one is the guarantee, the other is the message.
   */
  async delete(id: Uuid): Promise<void> {
    await this.db.query('DELETE FROM saved_location WHERE id = $1', [id]);
  }

  /** 3.1.8 — every location, re-evaluated on each cluster ingestion cycle. */
  async all(): Promise<SavedLocation[]> {
    const rows = await this.db.query(`SELECT ${COLUMNS} FROM saved_location ORDER BY id`);
    return rows.map((row) => SavedLocationRepository.toLocation(row));
  }

  private static toLocation(row: Row): SavedLocation {
    const location = new SavedLocation();
    location.id = row.id as Uuid;
    location.accountId = row.account_id as Uuid;
    location.inputText = row.input_text as string;
    location.resolvedAddress = row.resolved_address as string;
    location.point = SavedLocationRepository.toPoint(row.point as string);
    location.label = row.label as LocationLabel;
    location.name = row.name as string;
    location.exposureStatus = row.exposure_status as ExposureStatus;
    location.exposure = {
      clusterId: (row.exposure_cluster_id as Uuid | null) ?? null,
      clusterLocality: (row.exposure_cluster_locality as string | null) ?? null,
      // `numeric` comes back from `pg` as a **string**, because it is arbitrary precision and a
      // JavaScript number cannot always hold it. Left as one it would render as "12.0" where a
      // number was expected, and `distance > 150` would compare a string.
      caseSize: SavedLocationRepository.numberOrNull(row.exposure_case_size),
      distanceMetres: SavedLocationRepository.numberOrNull(row.exposure_distance_metres),
      dataTimestamp: (row.exposure_data_timestamp as Date | null) ?? null,
    };
    location.rain24hMm = SavedLocationRepository.numberOrNull(row.rain_24h_mm);
    location.rain72hMm = SavedLocationRepository.numberOrNull(row.rain_72h_mm);
    location.evaluatedAt = (row.evaluated_at as Date | null) ?? null;
    return location;
  }

  private static numberOrNull(value: unknown): number | null {
    return value === null || value === undefined ? null : Number(value);
  }

  /** GeoJSON `Point` coordinates are [longitude, latitude] — in that order, which is not ours. */
  private static toPoint(geoJson: string): GeoPoint {
    const parsed = JSON.parse(geoJson) as { coordinates: [number, number] };
    return new GeoPoint(parsed.coordinates[1], parsed.coordinates[0]);
  }
}

/**
 * 6.1.1, 6.1.3, 6.1.4 — one subscription per saved location, enforced by a UNIQUE constraint.
 *
 * The upsert therefore conflicts on `saved_location_id` rather than on `id`: a controller that
 * builds a fresh `AlertSubscription.create(...)` for a location that already has one would
 * otherwise insert a second row and violate the constraint, and 6.1.1's "a switch per location"
 * means the location is the key.
 */
export class AlertSubscriptionRepository implements AlertSubscriptionStore {
  constructor(private readonly db: Database) {}

  async findForLocation(locationId: Uuid): Promise<AlertSubscription | null> {
    const rows = await this.db.query(
      `SELECT id, saved_location_id, account_id, enabled, growth_threshold, triggers
         FROM alert_subscription WHERE saved_location_id = $1`,
      [locationId],
    );
    if (rows.length === 0) {
      return null;
    }
    const row = rows[0] as Row;
    const subscription = new AlertSubscription();
    subscription.id = row.id as Uuid;
    subscription.savedLocationId = row.saved_location_id as Uuid;
    subscription.accountId = row.account_id as Uuid;
    subscription.enabled = row.enabled as boolean;
    subscription.growthThreshold = Number(row.growth_threshold);
    subscription.triggers = (row.triggers as string[]).map((t) => t as AlertTrigger);
    return subscription;
  }

  async save(subscription: AlertSubscription): Promise<AlertSubscription> {
    subscription.id = subscription.id || randomUUID();
    const rows = await this.db.query(
      `INSERT INTO alert_subscription (id, saved_location_id, account_id, enabled, growth_threshold, triggers)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (saved_location_id) DO UPDATE SET
         account_id       = EXCLUDED.account_id,
         enabled          = EXCLUDED.enabled,
         growth_threshold = EXCLUDED.growth_threshold,
         triggers         = EXCLUDED.triggers
       RETURNING id`,
      [
        subscription.id,
        subscription.savedLocationId,
        subscription.accountId,
        subscription.enabled,
        subscription.growthThreshold,
        subscription.triggers,
      ],
    );
    // The row that already existed keeps its own id, so the caller's object is corrected to match
    // what is stored rather than holding an id that names nothing.
    subscription.id = (rows[0] as Row | undefined)?.id as Uuid ?? subscription.id;
    return subscription;
  }

  /** 3.1.12. @returns how many were removed, which the deletion confirmation states. */
  async deleteForLocation(locationId: Uuid): Promise<number> {
    const rows = await this.db.query(
      'DELETE FROM alert_subscription WHERE saved_location_id = $1 RETURNING id',
      [locationId],
    );
    return rows.length;
  }
}
