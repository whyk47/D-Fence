/**
 * D-Fence — ObservationRepository, OperatorRegistryRepository and ReferralRepository.
 * Stereotype: <<persistence>>. Traces: 1.5.9, 1.5.10, 1.5.11, 1.6.5, 1.6.6, 1.6.7, 1.6.8,
 * 4.1.24, 8.6.1, 8.6.4, 8.6.7, 8.6.8, 10.2.3, 10.6.3.
 *
 * Migration 005 created `observation_record`, `vector_control_operator`, `geocode_cache` and
 * `referral` on 2026-09-17. Until now nothing wrote to any of them: `server.ts` bound all three
 * ports to their in-memory implementations, so the tables existed and stayed empty while the data
 * lived in three `Map`s inside the process.
 *
 * What that cost, per store:
 *
 *   - **Observations.** 1.5.11 makes the supplier's observation id the key so that overlapping
 *     ingestion runs do not count the same sighting twice. Held in memory, the deduplication was
 *     real only within one container lifetime: every restart re-admitted the entire window, and
 *     `ExternalObservationDensity` counted records it had already counted. The driver is capped at
 *     0.20, so this did not look like a fault — it looked like activity.
 *   - **The operator registry.** 1.6.5 caches 290 geocodes precisely so a reload costs nothing the
 *     second time. In memory it was discarded on every restart, and each one meant 290 OneMap
 *     round trips to rebuild a file that is published once and had not changed.
 *   - **Referrals.** The worst of the three. 8.6.6 tells a resident their report has gone to an
 *     authority; 8.6.7 shows the report as referred rather than as having an open work order. A
 *     restart erased the referral and left the report in a state whose explanation no longer
 *     existed — the resident had been told something the system could no longer confirm.
 */
import { randomUUID } from 'node:crypto';
import { Database, Row } from './Database';
import { GeoPoint, Uuid } from '../entity/valueTypes';
import { PestType } from '../entity/enums';
import { ObservationRecord } from '../entity/ObservationRecord';
import { VectorControlOperator } from '../entity/VectorControlOperator';
import { Referral } from '../entity/Referral';
import { ObservationStore, OperatorRegistryStore, ReferralStore } from '../ports/Stores';

/** GeoJSON `Point` coordinates are [longitude, latitude] — in that order, which is not ours. */
function toPoint(geoJson: string | null): GeoPoint | null {
  if (geoJson === null) {
    return null;
  }
  const parsed = JSON.parse(geoJson) as { coordinates: [number, number] };
  return new GeoPoint(parsed.coordinates[1], parsed.coordinates[0]);
}

export class ObservationRepository implements ObservationStore {
  constructor(private readonly db: Database) {}

  /**
   * 1.5.11 — `ON CONFLICT DO NOTHING`, and the count of what was actually inserted.
   *
   * The return value is the number of *new* records, which callers report as the run's yield. It is
   * taken from `RETURNING` rather than from the length of the input, because those two differ by
   * exactly the overlap between runs and that overlap is the thing 1.5.11 exists to discount.
   */
  async save(observations: ObservationRecord[]): Promise<number> {
    if (observations.length === 0) {
      return 0;
    }
    let written = 0;
    await this.db.transaction(async (tx) => {
      for (const o of observations) {
        // 1.5.10 discards a record that binds to no locality before it reaches a store, and the
        // column is NOT NULL. Skipped rather than inserted with a placeholder: a locality-less
        // observation would be counted by no locality and would sit in the table for ever.
        if (o.localityId === null) {
          continue;
        }
        const rows = await tx.query(
          `INSERT INTO observation_record
             (observation_id, pest_type, taxon_name, observed_on, point, positional_accuracy_m,
              quality_grade, locality_id)
           VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7, $8, $9)
           ON CONFLICT (observation_id) DO NOTHING
           RETURNING observation_id`,
          [
            o.observationId,
            o.pestType,
            o.taxonName,
            o.observedOn,
            o.location.longitude,
            o.location.latitude,
            o.positionalAccuracyM,
            o.qualityGrade,
            o.localityId,
          ],
        );
        written += rows.length;
      }
    });
    return written;
  }

  /**
   * 4.1.24's input, counted in SQL.
   *
   * Counted rather than fetched-and-filtered for the reason §6.10 established the hard way: this
   * runs once per pest per locality per cycle, and returning rows to count them in JavaScript is
   * how the rainfall driver came to move 3 MB every five minutes.
   */
  async countByLocality(pestType: PestType, localityId: string, since: Date): Promise<number> {
    const rows = await this.db.query(
      `SELECT count(*) AS n FROM observation_record
        WHERE pest_type = $1 AND locality_id = $2 AND observed_on >= $3::date`,
      [pestType, localityId, since],
    );
    return Number((rows[0] as Row | undefined)?.n ?? 0);
  }

  async all(): Promise<ObservationRecord[]> {
    const rows = await this.db.query(
      `SELECT observation_id, pest_type, taxon_name, observed_on,
              ST_AsGeoJSON(point) AS point, positional_accuracy_m, quality_grade, locality_id
         FROM observation_record ORDER BY observed_on DESC, observation_id`,
    );
    return rows.map(
      (row) =>
        new ObservationRecord(
          String(row.observation_id),
          row.pest_type as PestType,
          String(row.taxon_name),
          new Date(row.observed_on as string),
          toPoint(row.point as string) ?? new GeoPoint(0, 0),
          row.positional_accuracy_m === null ? null : Number(row.positional_accuracy_m),
          String(row.quality_grade),
          String(row.locality_id),
        ),
    );
  }
}

export class OperatorRegistryRepository implements OperatorRegistryStore {
  constructor(private readonly db: Database) {}

  /**
   * 1.6.6 — replaced wholesale, in one transaction.
   *
   * The delete and the insert are in the same transaction because a registry is a snapshot: a
   * failure between them would leave 1.6.8 computing "how far the nearest operator is" against an
   * empty table, which returns not an error but a driver value that quietly says nobody is nearby.
   *
   * `geocode_cache` is deliberately not touched. 1.6.5 exists so a reload costs nothing the second
   * time, and a cache emptied with the rows it described would make every load re-resolve all 290.
   *
   * An empty list is refused outright rather than written — see the guard below.
   */
  async saveRegistry(operators: VectorControlOperator[], publishedAt: Date | null): Promise<void> {
    if (operators.length === 0) {
      // A load that produced no operators has failed, and 1.6.6 says the previous registry
      // survives a failed load. Replacing with nothing would turn one bad download into a
      // deletion, and the symptom would not be an error: `ResponseCapacityDeficit` would quietly
      // start answering "nobody is anywhere near", which is a driver value, not a gap.
      return;
    }
    await this.db.transaction(async (tx) => {
      await tx.query('DELETE FROM vector_control_operator');
      for (const o of operators) {
        await tx.query(
          `INSERT INTO vector_control_operator
             (postal_code, company_name, block_or_house, street_name, telephone, point, published_at)
           VALUES ($1, $2, $3, $4, $5,
                   CASE WHEN $6::double precision IS NULL THEN NULL
                        ELSE ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography END,
                   $8)
           ON CONFLICT (postal_code, company_name) DO UPDATE SET
             block_or_house = EXCLUDED.block_or_house, street_name = EXCLUDED.street_name,
             telephone = EXCLUDED.telephone, point = EXCLUDED.point,
             published_at = EXCLUDED.published_at`,
          [
            o.postalCode,
            o.companyName,
            o.blockOrHouseNumber,
            o.streetName,
            o.telephoneNumber,
            o.location?.longitude ?? null,
            o.location?.latitude ?? null,
            publishedAt,
          ],
        );
      }
    });
  }

  async registry(): Promise<VectorControlOperator[]> {
    const rows = await this.db.query(
      `SELECT postal_code, company_name, block_or_house, street_name, telephone,
              ST_AsGeoJSON(point) AS point, published_at
         FROM vector_control_operator ORDER BY company_name, postal_code`,
    );
    return rows.map(
      (row) =>
        new VectorControlOperator(
          String(row.company_name),
          String(row.block_or_house),
          String(row.street_name),
          String(row.postal_code),
          String(row.telephone),
          toPoint(row.point as string | null),
          row.published_at === null ? null : (row.published_at as Date),
        ),
    );
  }

  /** 1.6.7 — one date for the dataset, taken from the rows that carry it. */
  async publishedAt(): Promise<Date | null> {
    const rows = await this.db.query(
      'SELECT max(published_at) AS at FROM vector_control_operator',
    );
    const at = (rows[0] as Row | undefined)?.at;
    return at === null || at === undefined ? null : (at as Date);
  }

  async cachedCoordinate(postalCode: string): Promise<GeoPoint | null> {
    const rows = await this.db.query(
      'SELECT ST_AsGeoJSON(point) AS point FROM geocode_cache WHERE postal_code = $1',
      [postalCode],
    );
    return rows.length === 0 ? null : toPoint((rows[0] as Row).point as string);
  }

  async cacheCoordinate(postalCode: string, point: GeoPoint): Promise<void> {
    await this.db.query(
      `INSERT INTO geocode_cache (postal_code, point)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography)
       ON CONFLICT (postal_code) DO UPDATE SET point = EXCLUDED.point, resolved_at = now()`,
      [postalCode, point.longitude, point.latitude],
    );
  }
}

export class ReferralRepository implements ReferralStore {
  constructor(private readonly db: Database) {}

  /**
   * Upsert by id, assigning one when absent — the same contract the in-memory store offers.
   *
   * The conflict target is `id` and not `report_id`, even though a unique index enforces one
   * referral per report (8.6.7). Conflicting on the report would let a second `refer()` silently
   * overwrite the first referral's reason, authority and referring manager; conflicting on the id
   * lets the constraint raise, which is the correct answer to "refer this twice".
   */
  async save(referral: Referral): Promise<Referral> {
    referral.id = referral.id || randomUUID();
    await this.db.query(
      `INSERT INTO referral
         (id, report_id, pest_type, authority, contact, reason, referred_by, referred_at,
          outcome, outcome_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         outcome = EXCLUDED.outcome, outcome_at = EXCLUDED.outcome_at`,
      [
        referral.id,
        referral.reportId,
        // The table carries the pest type and the entity does not: it is read from the report at
        // referral time, and a referral is a record of what was believed then. Stored as the
        // authority's own subject line rather than re-derived on read, for the same reason 4.1.10
        // stores the breakdown.
        await this.pestTypeOf(referral.reportId),
        referral.destinationAuthority,
        referral.destinationContactNumber,
        referral.reason,
        referral.referredBy,
        referral.referredAt,
        referral.outcome,
        referral.outcomeRecordedAt,
      ],
    );
    return referral;
  }

  private async pestTypeOf(reportId: Uuid): Promise<string> {
    const rows = await this.db.query('SELECT pest_type FROM report WHERE id = $1', [reportId]);
    return String((rows[0] as Row | undefined)?.pest_type ?? PestType.Mosquito);
  }

  async findById(id: Uuid): Promise<Referral | null> {
    const rows = await this.db.query('SELECT * FROM referral WHERE id = $1', [id]);
    return rows.length === 0 ? null : ReferralRepository.toReferral(rows[0] as Row);
  }

  async findByReport(reportId: Uuid): Promise<Referral | null> {
    const rows = await this.db.query('SELECT * FROM referral WHERE report_id = $1', [reportId]);
    return rows.length === 0 ? null : ReferralRepository.toReferral(rows[0] as Row);
  }

  /** 8.6.7 — open means referred and not yet answered. A closed referral is history. */
  async findOpen(): Promise<Referral[]> {
    const rows = await this.db.query(
      'SELECT * FROM referral WHERE outcome_at IS NULL ORDER BY referred_at',
    );
    return rows.map((row) => ReferralRepository.toReferral(row));
  }

  private static toReferral(row: Row): Referral {
    const referral = new Referral();
    referral.id = String(row.id);
    referral.reportId = String(row.report_id);
    referral.destinationAuthority = String(row.authority);
    referral.destinationContactNumber = String(row.contact);
    referral.reason = String(row.reason);
    referral.referredBy = String(row.referred_by ?? '');
    referral.referredAt = row.referred_at as Date;
    referral.outcome = row.outcome === null ? null : String(row.outcome);
    referral.outcomeRecordedAt = row.outcome_at === null ? null : (row.outcome_at as Date);
    return referral;
  }
}
