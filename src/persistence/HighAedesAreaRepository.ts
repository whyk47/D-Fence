/**
 * D-Fence — HighAedesAreaRepository.
 * Stereotype: <<persistence>>. Traces: 1.1.19, 1.6.7 (the same published-date discipline).
 *
 * NEA's high-Aedes areas, from the Gravitrap feed. Stored and shown; deliberately not scored —
 * PEST-PRIORITY-MODEL.md §8 step 9 and migration 008 both say why.
 *
 * The geometry goes in through `ST_GeomFromGeoJSON` rather than through a hand-built WKT string.
 * A polygon with several hundred vertices concatenated into `POLYGON((...))` is a parameter that
 * can be malformed in ways that produce a *valid* but wrong shape, and GeoJSON is what the feed
 * already speaks.
 */
import { Database, Row } from './Database';
import { HighAedesArea } from '../entity/HighAedesArea';
import { HighAedesAreaStore } from '../ports/Stores';

export class HighAedesAreaRepository implements HighAedesAreaStore {
  constructor(private readonly db: Database) {}

  /**
   * Replaced wholesale, in one transaction.
   *
   * The feed is a published snapshot of a geography: an area NEA has dropped must disappear rather
   * than linger as evidence nobody is republishing. The delete and the inserts share a transaction
   * so that a failure between them cannot leave the map empty — an empty set here reads as "no
   * high-Aedes areas in Singapore", which is a claim, not an absence.
   */
  async replaceAll(areas: HighAedesArea[], publishedAt: Date | null): Promise<number> {
    if (areas.length === 0) {
      // A feed that parsed to nothing is a feed that failed, and the template records it as such.
      // Emptying the table on the strength of it would turn one bad download into a deletion.
      return 0;
    }
    await this.db.transaction(async (tx) => {
      await tx.query('DELETE FROM high_aedes_area');
      for (const area of areas) {
        await tx.query(
          `INSERT INTO high_aedes_area (object_id, name, description, boundary, published_at)
           VALUES ($1, $2, $3,
                   ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))::geography, $5)
           ON CONFLICT (object_id) DO UPDATE SET
             name = EXCLUDED.name, description = EXCLUDED.description,
             boundary = EXCLUDED.boundary, published_at = EXCLUDED.published_at,
             ingested_at = now()`,
          [
            area.objectId,
            area.name,
            area.description,
            JSON.stringify({ type: 'MultiPolygon', coordinates: area.polygons }),
            publishedAt,
          ],
        );
      }
    });
    return areas.length;
  }

  async all(): Promise<HighAedesArea[]> {
    const rows = await this.db.query(
      `SELECT object_id, name, description, ST_AsGeoJSON(boundary) AS boundary, published_at
         FROM high_aedes_area ORDER BY name, object_id`,
    );
    return rows.map((row) => HighAedesAreaRepository.toArea(row));
  }

  /** 1.6.7's discipline: the publisher's stamp on the stored set, never the load date. */
  async publishedAt(): Promise<Date | null> {
    const rows = await this.db.query('SELECT max(published_at) AS at FROM high_aedes_area');
    const at = (rows[0] as Row | undefined)?.at;
    return at === null || at === undefined ? null : (at as Date);
  }

  /**
   * The localities whose boundary meets any stored area.
   *
   * `ST_Intersects` and not `ST_Contains`: a cluster that overlaps a high-Aedes area by a street is
   * in it for every purpose anyone would use this for, and containment would answer "no" for every
   * cluster larger than the area it sits in.
   */
  async localityIdsInAreas(): Promise<string[]> {
    const rows = await this.db.query(
      `SELECT DISTINCT c.id FROM cluster c
         JOIN high_aedes_area a ON ST_Intersects(c.boundary, a.boundary)
        WHERE c.is_active`,
    );
    return rows.map((row) => String(row.id));
  }

  private static toArea(row: Row): HighAedesArea {
    const geo = JSON.parse(String(row.boundary)) as {
      coordinates: Array<Array<Array<[number, number]>>>;
    };
    return new HighAedesArea(
      String(row.object_id),
      String(row.name),
      String(row.description),
      geo.coordinates,
      row.published_at === null ? null : (row.published_at as Date),
    );
  }
}

/**
 * The in-memory fallback, for a contributor with no database and for every unit test (10.6.3).
 *
 * `localityIdsInAreas` returns nothing and says so rather than approximating. Point-in-polygon
 * without PostGIS is the second implementation of a spatial predicate that `valueTypes.Polygon`
 * refuses to provide for exactly this reason: two answers to one geometric question is a bug that
 * surfaces as a locality that is inside an area on one deployment and outside it on another.
 */
export class InMemoryHighAedesAreaStore implements HighAedesAreaStore {
  private areas: HighAedesArea[] = [];
  private published: Date | null = null;

  async replaceAll(areas: HighAedesArea[], publishedAt: Date | null): Promise<number> {
    if (areas.length === 0) {
      return 0;
    }
    this.areas = [...areas];
    this.published = publishedAt;
    return areas.length;
  }

  async all(): Promise<HighAedesArea[]> {
    return [...this.areas];
  }

  async publishedAt(): Promise<Date | null> {
    return this.published;
  }

  async localityIdsInAreas(): Promise<string[]> {
    return [];
  }
}
