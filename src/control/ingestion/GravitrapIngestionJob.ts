/**
 * D-Fence — GravitrapIngestionJob (Template Method).
 * Stereotype: <<control>>. Traces: 1.1.19, 1.1.20, 1.1.21, 10.2.2, 10.2.4.
 *
 * Step 9 of PEST-PRIORITY-MODEL.md §8, built as far as it can honestly be built: the feed is
 * fetched, parsed, stored and dated. **It is not wired into any score**, and the three reasons
 * recorded in that document are the reasons — an eighth tier A driver contradicts 4.2.5 as
 * written, has no requirement behind it, and would redistribute seven weights each argued for
 * individually. Those are objections to scoring it, not to collecting it. A team deciding whether
 * to add a driver is better served by a feed they can look at than by a paragraph describing one.
 *
 * Only `shouldRun` differs meaningfully from the other jobs. The payload is 420 KB and the
 * publisher moves it a few times a year, so 1.1.20's "download only when the stamp has moved" is
 * doing more work here than on the 25 KB cluster feed that changes daily.
 */
import { AbstractIngestionJob } from './AbstractIngestionJob';
import { HighAedesAreaSource } from '../../boundary/gateways/GravitrapGateway';
import { HighAedesAreaStore, IngestionRunStore } from '../../ports/Stores';
import { HighAedesArea } from '../../entity/HighAedesArea';
import { SourceKind } from '../../entity/enums';
import { ParsedBatch, RawPayload } from '../../ports/types';

interface RawFeature {
  properties?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown };
}

type Ring = ReadonlyArray<readonly [number, number]>;

export class GravitrapIngestionJob extends AbstractIngestionJob {
  /** 1.1.17 — features the parser could not use, for the run's own record. */
  rejected = 0;

  constructor(
    private readonly source: HighAedesAreaSource,
    runs: IngestionRunStore,
    private readonly areas: HighAedesAreaStore,
  ) {
    super(source, runs);
  }

  protected sourceKind(): SourceKind {
    return SourceKind.Gravitrap;
  }

  /** 1.1.20 — fetch only when the publisher's stamp has moved since the last successful load. */
  protected override async shouldRun(): Promise<boolean> {
    const published = await this.source.fetchLastUpdatedAt();
    if (published === null) {
      // Null is "download anyway". A missed republication is worse than one redundant download of
      // a file that changes a few times a year.
      return true;
    }
    const seen = await this.runs.lastPublisherStamp(SourceKind.Gravitrap);
    return seen === null || seen !== published;
  }

  protected fetch(): Promise<RawPayload> {
    return this.source.fetchAreas();
  }

  protected async parse(raw: RawPayload): Promise<ParsedBatch> {
    const body = raw.body as { features?: RawFeature[] } | undefined;
    const features = Array.isArray(body?.features) ? body.features : [];
    const records: HighAedesArea[] = [];
    this.rejected = 0;

    for (const feature of features) {
      const props = feature.properties ?? {};
      const objectId = GravitrapIngestionJob.text(props.OBJECTID);
      const polygons = GravitrapIngestionJob.toPolygons(feature.geometry);
      // A feature with no id cannot be updated in place on the next republication, and one with no
      // geometry cannot be intersected with anything. Either way it is not an area; counted rather
      // than thrown, so one malformed feature does not discard the other several hundred (1.1.17).
      if (objectId === '' || polygons.length === 0) {
        this.rejected += 1;
        continue;
      }
      records.push(
        new HighAedesArea(
          objectId,
          GravitrapIngestionJob.text(props.NAME),
          GravitrapIngestionJob.text(props.DESCRIPTION),
          polygons,
          null,
        ),
      );
    }
    return { retrievedAt: raw.retrievedAt, records };
  }

  protected async persist(batch: ParsedBatch): Promise<number> {
    const published = await this.source.fetchLastUpdatedAt();
    const at = published === null ? null : new Date(published);
    return this.areas.replaceAll(batch.records as HighAedesArea[], at);
  }

  /** 1.1.19 — remember the stamp we just loaded, so 1.1.20 can compare against it next time. */
  protected override async afterPersist(): Promise<void> {
    const published = await this.source.fetchLastUpdatedAt();
    if (published !== null) {
      await this.runs.savePublisherStamp(SourceKind.Gravitrap, published);
    }
  }

  private static text(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  /**
   * GeoJSON `Polygon` and `MultiPolygon` differ by exactly one level of nesting, and the publisher
   * uses both across its datasets. Normalised to the MultiPolygon shape here so that everything
   * downstream — the entity, the column type, the `ST_Intersects` — deals with one of them.
   *
   * Coordinates stay in GeoJSON's `[longitude, latitude]` order all the way to PostGIS, which is
   * the order `ST_MakePoint` and `ST_GeomFromGeoJSON` both take. The lat/lng swap that `GeoPoint`
   * exists to prevent belongs at the point where a *point* is constructed, and no point is
   * constructed here.
   */
  private static toPolygons(
    geometry: { type?: string; coordinates?: unknown } | undefined,
  ): ReadonlyArray<ReadonlyArray<Ring>> {
    const coordinates = geometry?.coordinates;
    if (!Array.isArray(coordinates)) {
      return [];
    }
    const asMulti =
      geometry?.type === 'MultiPolygon' ? (coordinates as unknown[]) : [coordinates as unknown];
    const out: Ring[][] = [];
    for (const polygon of asMulti) {
      if (!Array.isArray(polygon)) {
        continue;
      }
      const rings: Ring[] = [];
      for (const ring of polygon as unknown[]) {
        if (!Array.isArray(ring)) {
          continue;
        }
        const points = (ring as unknown[])
          .filter((p): p is number[] => Array.isArray(p) && p.length >= 2)
          .map((p) => [Number(p[0]), Number(p[1])] as const);
        if (points.length >= 4) {
          rings.push(points);
        }
      }
      if (rings.length > 0) {
        out.push(rings);
      }
    }
    return out;
  }
}
