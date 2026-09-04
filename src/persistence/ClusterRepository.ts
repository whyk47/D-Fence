/**
 * D-Fence — ClusterRepository.
 * Stereotype: <<persistence>>. Traces: 1.1.x, 1.2.5, 1.3.2–1.3.5, 3.1.8, 5.1.7, 7.3.1, 9.1.9.
 *
 * Implements the same `ClusterStore` port as `InMemoryClusterStore`, so the control layer cannot
 * tell which it has — that is the ports layer earning its keep rather than being asserted.
 *
 * **The one thing this class does that the in-memory store cannot** is answer containment
 * authoritatively. `Polygon.contains` throws on purpose and `InMemoryClusterLocator` computes an
 * approximation for development; here 3.1.8 and 5.1.7 are answered by PostGIS with `ST_Covers` and
 * `ST_DWithin` over a GIST index. Exactly one implementation is bound per process, which is what
 * the warning on `Polygon.contains` actually requires — one answer to containment, not two.
 *
 * Geography, not geometry: `ST_DWithin` on a `geography` column takes **metres**, which is what
 * 3.1.8's 150 m and 5.1.11's 50 m are written in. On `geometry` the same call would take degrees
 * and every threshold in the requirements would be silently wrong by a factor of about 111,000.
 */
import { randomUUID } from 'node:crypto';
import { Database, Row } from './Database';
import { Cluster } from '../entity/Cluster';
import { ClusterSnapshot } from '../entity/ClusterSnapshot';
import { GeoPoint, Polygon, PremisesMix, Uuid } from '../entity/valueTypes';
import { ChangeClass, ForecastRegion, Trajectory } from '../entity/enums';
import { ClusterStore, ForecastDerivation } from '../ports/Stores';
import { ParsedBatch } from '../ports/types';

/** Every column, once, so a change to the table is a change in one place. */
const COLUMNS = `
  id, object_id, locality, ST_AsGeoJSON(boundary) AS boundary, case_size, case_delta,
  change_class, trajectory, habitats_homes, habitats_public_places, habitats_construction_sites,
  forecast_region, heavy_rain_expected, forecast_valid_from, forecast_valid_to,
  first_seen_at, last_updated_at, is_active`;

export class ClusterRepository implements ClusterStore {
  constructor(private readonly db: Database) {}

  async findById(id: Uuid): Promise<Cluster | null> {
    const rows = await this.db.query(`SELECT ${COLUMNS} FROM cluster WHERE id = $1`, [id]);
    return rows.length === 0 ? null : ClusterRepository.toCluster(rows[0] as Row);
  }

  async findByObjectId(objectId: string): Promise<Cluster | null> {
    const rows = await this.db.query(`SELECT ${COLUMNS} FROM cluster WHERE object_id = $1`, [objectId]);
    return rows.length === 0 ? null : ClusterRepository.toCluster(rows[0] as Row);
  }

  /** Clusters the feed still publishes (1.1.10). */
  async findActive(): Promise<Cluster[]> {
    const rows = await this.db.query(`SELECT ${COLUMNS} FROM cluster WHERE is_active ORDER BY case_size DESC`);
    return rows.map((r) => ClusterRepository.toCluster(r));
  }

  /**
   * 3.1.8, 5.1.7 — the authoritative containment answer.
   *
   * `ST_Covers`, not `ST_Contains`: a point exactly on a boundary is inside it. A resident whose
   * block sits on the edge of a cluster is in that cluster, and `ST_Contains` would say otherwise
   * for the one case where the answer matters most.
   */
  async findContaining(point: GeoPoint): Promise<Cluster | null> {
    const rows = await this.db.query(
      `SELECT ${COLUMNS} FROM cluster
        WHERE is_active AND ST_Covers(boundary, ST_MakePoint($2, $1)::geography)
        LIMIT 1`,
      [point.latitude, point.longitude],
    );
    return rows.length === 0 ? null : ClusterRepository.toCluster(rows[0] as Row);
  }

  /** 3.1.8's band. `metres` is metres because the column is `geography`. Nearest first. */
  async findWithin(point: GeoPoint, metres: number): Promise<Array<{ cluster: Cluster; metres: number }>> {
    const rows = await this.db.query(
      `SELECT ${COLUMNS}, ST_Distance(boundary, ST_MakePoint($2, $1)::geography) AS distance_m
         FROM cluster
        WHERE is_active AND ST_DWithin(boundary, ST_MakePoint($2, $1)::geography, $3)
        ORDER BY distance_m`,
      [point.latitude, point.longitude, metres],
    );
    return rows.map((r) => ({ cluster: ClusterRepository.toCluster(r), metres: Number(r.distance_m) }));
  }

  /**
   * 1.1.5–1.1.7 — upsert by the feed's OBJECTID, preserving first-seen, and moving last-updated
   * only when the case size actually differs (1.1.7).
   *
   * One statement per record inside one transaction: a feed batch is all-or-nothing, because a
   * half-applied batch would make the next cycle's change detection (1.1.9) compare against a
   * snapshot that never existed as a published state.
   */
  async upsertFromFeed(batch: ParsedBatch): Promise<number> {
    const records = batch.records as Cluster[];
    let written = 0;
    await this.db.transaction(async (tx) => {
      for (const cluster of records) {
        const rows = await tx.query(
          `INSERT INTO cluster (
             id, object_id, locality, boundary, case_size, case_delta, change_class, trajectory,
             habitats_homes, habitats_public_places, habitats_construction_sites,
             first_seen_at, last_updated_at, is_active)
           VALUES ($1, $2, $3, ST_GeomFromGeoJSON($4)::geography, $5, $6, $7, $8, $9, $10, $11, $12, $12, true)
           ON CONFLICT (object_id) DO UPDATE SET
             locality        = EXCLUDED.locality,
             boundary        = EXCLUDED.boundary,
             case_size       = EXCLUDED.case_size,
             case_delta      = EXCLUDED.case_delta,
             change_class    = EXCLUDED.change_class,
             trajectory      = EXCLUDED.trajectory,
             habitats_homes  = EXCLUDED.habitats_homes,
             habitats_public_places = EXCLUDED.habitats_public_places,
             habitats_construction_sites = EXCLUDED.habitats_construction_sites,
             is_active       = true,
             -- 1.1.7: last_updated_at moves only when something actually changed. Touching it on
             -- every cycle would make "when did this cluster last change" mean "when did we last
             -- look", which is the question nobody is asking.
             last_updated_at = CASE WHEN cluster.case_size IS DISTINCT FROM EXCLUDED.case_size
                                    THEN EXCLUDED.last_updated_at ELSE cluster.last_updated_at END
           RETURNING id`,
          [
            cluster.id || randomUUID(),
            cluster.objectId,
            cluster.locality,
            ClusterRepository.toGeoJson(cluster.boundary),
            cluster.caseSize,
            cluster.caseDelta ?? 0,
            cluster.changeClass ?? ChangeClass.NEW,
            cluster.trajectory ?? Trajectory.Stable,
            cluster.premisesMix?.homes ?? [],
            cluster.premisesMix?.publicPlaces ?? [],
            cluster.premisesMix?.constructionSites ?? [],
            batch.retrievedAt,
          ],
        );
        // The generated id is only used when the row was new; on conflict the stored id wins, and
        // the caller needs it to attach snapshots to the right cluster.
        cluster.id = String((rows[0] as Row).id);
        written += 1;
      }
    });
    return written;
  }

  /** 1.1.10 — absent from the feed means closed. Returns the object ids that were closed. */
  async deactivateAbsent(objectIdsSeen: Set<string>): Promise<string[]> {
    const rows = await this.db.query(
      `UPDATE cluster SET is_active = false
        WHERE is_active AND NOT (object_id = ANY($1))
        RETURNING object_id`,
      [[...objectIdsSeen]],
    );
    return rows.map((r) => String(r.object_id));
  }

  /** 1.1.5 — append only. */
  async appendSnapshot(snapshot: ClusterSnapshot): Promise<void> {
    await this.db.query(
      `INSERT INTO cluster_snapshot (id, cluster_id, retrieved_at, case_size, boundary, fmel_upd_d)
       VALUES ($1, $2, $3, $4, ST_GeomFromGeoJSON($5)::geography, $6)`,
      [
        snapshot.id || randomUUID(),
        snapshot.clusterId,
        snapshot.retrievedAt,
        snapshot.caseSize,
        ClusterRepository.toGeoJson(snapshot.boundary),
        snapshot.fmelUpdD ?? '',
      ],
    );
  }

  /** 1.1.6, 1.1.8 — the previous snapshot, or null the first time a cluster is seen. */
  async latestSnapshot(objectId: string): Promise<ClusterSnapshot | null> {
    const rows = await this.db.query(
      `SELECT s.id, s.cluster_id, s.retrieved_at, s.case_size, ST_AsGeoJSON(s.boundary) AS boundary, s.fmel_upd_d
         FROM cluster_snapshot s JOIN cluster c ON c.id = s.cluster_id
        WHERE c.object_id = $1
        ORDER BY s.retrieved_at DESC LIMIT 1`,
      [objectId],
    );
    return rows.length === 0 ? null : ClusterRepository.toSnapshot(rows[0] as Row);
  }

  /** 9.1.9, 9.1.10 — inclusive of the cut-off, so a 30-day window contains thirty days. */
  async snapshotsSince(clusterId: Uuid, since: Date): Promise<ClusterSnapshot[]> {
    const rows = await this.db.query(
      `SELECT id, cluster_id, retrieved_at, case_size, ST_AsGeoJSON(boundary) AS boundary, fmel_upd_d
         FROM cluster_snapshot WHERE cluster_id = $1 AND retrieved_at >= $2 ORDER BY retrieved_at`,
      [clusterId, since],
    );
    return rows.map((r) => ClusterRepository.toSnapshot(r));
  }

  /** 7.3.1 — every cluster's snapshots, closed clusters included. See the port's note on why. */
  async allSnapshotsSince(since: Date): Promise<ClusterSnapshot[]> {
    const rows = await this.db.query(
      `SELECT id, cluster_id, retrieved_at, case_size, ST_AsGeoJSON(boundary) AS boundary, fmel_upd_d
         FROM cluster_snapshot WHERE retrieved_at >= $1 ORDER BY retrieved_at`,
      [since],
    );
    return rows.map((r) => ClusterRepository.toSnapshot(r));
  }

  /** 1.3.2–1.3.5 — the four derived forecast fields, and nothing else. */
  async saveForecastDerivation(clusterId: Uuid, derivation: ForecastDerivation): Promise<void> {
    await this.db.query(
      `UPDATE cluster SET forecast_region = $2, heavy_rain_expected = $3,
              forecast_valid_from = $4, forecast_valid_to = $5
        WHERE id = $1`,
      [clusterId, derivation.region, derivation.heavyRainExpected, derivation.validFrom, derivation.validTo],
    );
  }

  // ---------------------------------------------------------------------------------------------
  // Mapping. Kept private and static: a row is not an entity, and the conversion belongs to the
  // layer that knows about columns.
  // ---------------------------------------------------------------------------------------------

  private static toCluster(row: Row): Cluster {
    const cluster = new Cluster();
    cluster.id = String(row.id);
    cluster.objectId = String(row.object_id);
    cluster.locality = String(row.locality);
    cluster.boundary = ClusterRepository.toPolygon(row.boundary);
    cluster.caseSize = Number(row.case_size);
    cluster.caseDelta = Number(row.case_delta);
    cluster.changeClass = row.change_class as ChangeClass;
    cluster.trajectory = row.trajectory as Trajectory;
    cluster.premisesMix = new PremisesMix(
      (row.habitats_homes as string[]) ?? [],
      (row.habitats_public_places as string[]) ?? [],
      (row.habitats_construction_sites as string[]) ?? [],
    );
    cluster.forecastRegion = row.forecast_region as ForecastRegion;
    cluster.heavyRainExpected = Boolean(row.heavy_rain_expected);
    cluster.forecastValidFrom = (row.forecast_valid_from as Date | null) ?? null;
    cluster.forecastValidTo = (row.forecast_valid_to as Date | null) ?? null;
    cluster.firstSeenAt = row.first_seen_at as Date;
    cluster.lastUpdatedAt = row.last_updated_at as Date;
    cluster.isActive = Boolean(row.is_active);
    return cluster;
  }

  private static toSnapshot(row: Row): ClusterSnapshot {
    const snapshot = new ClusterSnapshot();
    snapshot.id = String(row.id);
    snapshot.clusterId = String(row.cluster_id);
    snapshot.retrievedAt = row.retrieved_at as Date;
    snapshot.caseSize = Number(row.case_size);
    snapshot.boundary = ClusterRepository.toPolygon(row.boundary);
    snapshot.fmelUpdD = String(row.fmel_upd_d ?? '');
    return snapshot;
  }

  /**
   * GeoJSON is `[longitude, latitude]`; GeoPoint takes `(latitude, longitude)`. Reversing them
   * puts every cluster in the Indian Ocean — the argument-order bug GeoPoint exists to prevent —
   * so the swap happens here, once, in each direction.
   */
  private static toPolygon(geoJson: unknown): Polygon {
    const parsed = JSON.parse(String(geoJson)) as { coordinates?: number[][][] };
    return new Polygon(
      (parsed.coordinates ?? []).map((ring) => ring.map(([lon, lat]) => new GeoPoint(Number(lat), Number(lon)))),
    );
  }

  private static toGeoJson(polygon: Polygon): string {
    return JSON.stringify({
      type: 'Polygon',
      coordinates: polygon.rings.map((ring) => ring.map((p) => [p.longitude, p.latitude])),
    });
  }
}

/**
 * D-Fence — the authoritative `ClusterLocator`, answered by PostGIS.
 * Stereotype: <<persistence>>. Traces: 3.1.8, 3.1.9, 5.1.7, 5.1.8.
 *
 * `InMemoryClusterLocator` computes the same two answers in JavaScript for development and test.
 * Exactly **one** of the two is bound per process — that is the whole point of the warning on
 * `Polygon.contains`. When a database is configured this one wins, because a stored exposure status
 * must come from the same engine that indexes the boundaries, not from an approximation that agrees
 * with it most of the time.
 */
export class PostgresClusterLocator {
  constructor(private readonly clusters: ClusterRepository) {}

  /** 5.1.7 — ST_Covers, so a point exactly on a boundary counts as inside. */
  containing(point: GeoPoint): Promise<Cluster | null> {
    return this.clusters.findContaining(point);
  }

  /**
   * 3.1.9, 5.1.8 — nearest by distance **to the boundary**, not to the centroid.
   *
   * `ST_Distance` on a geography returns 0 for a point inside the polygon, which is the answer
   * 3.1.9 wants: a resident inside a cluster is not "12 metres from it".
   */
  async nearestWithin(
    point: GeoPoint,
    radiusMetres: number,
  ): Promise<{ cluster: Cluster; distanceMetres: number } | null> {
    const found = await this.clusters.findWithin(point, radiusMetres);
    const nearest = found[0];
    return nearest === undefined ? null : { cluster: nearest.cluster, distanceMetres: nearest.metres };
  }
}
