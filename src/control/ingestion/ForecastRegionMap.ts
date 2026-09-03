/**
 * D-Fence — the five macro-region polygons, and centroid containment against them.
 * Stereotype: <<control>>. Traces: 1.3.2, 1.3.5.
 *
 * **Why this file exists at all.** 1.3.2 says a cluster is mapped to a forecast region "by the
 * region polygon containing the cluster centroid" — and the 24-hour forecast endpoint publishes no
 * polygons. It returns `periods[].regions.{north, south, east, west, central}` and nothing spatial
 * (verified live 2026-09-03). The boundaries therefore have to exist somewhere, and the honest
 * place is here, in one file, stated as an approximation, rather than as five magic comparisons
 * buried in the ingestion job.
 *
 * **What the approximation is.** Five axis-aligned rectangles that *partition* Singapore's
 * bounding box exactly — no overlap, no gap — which is what makes 1.3.2's "exactly one" true by
 * construction rather than by hoping the test data behaves:
 *
 * | Region  | Latitude        | Longitude          |
 * |---------|-----------------|--------------------|
 * | north   | ≥ 1.39          | any                |
 * | south   | < 1.29          | any                |
 * | west    | [1.29, 1.39)    | < 103.77           |
 * | central | [1.29, 1.39)    | [103.77, 103.89]   |
 * | east    | [1.29, 1.39)    | > 103.89           |
 *
 * The cut lines were chosen against known towns, not drawn freehand — Woodlands and Yishun north,
 * Bukit Merah and Sentosa south, Clementi and Tuas west, Bedok and Changi east, Bishan and Bukit
 * Timah central — and those towns are the assertions in `tests/forecast.test.ts`, so moving a line
 * has to be argued for against real places.
 *
 * **This is coarser than NEA's own region shapes and must be said so in the demo.** It is a
 * rain-is-coming flag over a 24-hour horizon, which is what 6.1.5 asks of it; it is not a spatial
 * claim about where the rain will fall. The requirement's own v0.3 note already records the
 * resolution loss.
 */
import { ForecastRegion } from '../../entity/enums';
import { GeoPoint, Polygon } from '../../entity/valueTypes';

interface RegionBox {
  region: ForecastRegion;
  minLat: number;
  /** Exclusive, so the boxes tile without a shared edge belonging to two regions. */
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export class ForecastRegionMap {
  /** Singapore plus its territorial waters, generously. Anything outside falls back to 1.3.2's
   *  nearest-region rule rather than being dropped. */
  static readonly BOUNDS = { minLat: 1.13, maxLat: 1.52, minLon: 103.56, maxLon: 104.12 };

  private static readonly CENTRAL_SOUTH_LAT = 1.29;
  private static readonly CENTRAL_NORTH_LAT = 1.39;
  private static readonly CENTRAL_WEST_LON = 103.77;
  private static readonly CENTRAL_EAST_LON = 103.89;

  private static readonly BOXES: RegionBox[] = [
    {
      region: ForecastRegion.north,
      minLat: ForecastRegionMap.CENTRAL_NORTH_LAT,
      maxLat: ForecastRegionMap.BOUNDS.maxLat,
      minLon: ForecastRegionMap.BOUNDS.minLon,
      maxLon: ForecastRegionMap.BOUNDS.maxLon,
    },
    {
      region: ForecastRegion.south,
      minLat: ForecastRegionMap.BOUNDS.minLat,
      maxLat: ForecastRegionMap.CENTRAL_SOUTH_LAT,
      minLon: ForecastRegionMap.BOUNDS.minLon,
      maxLon: ForecastRegionMap.BOUNDS.maxLon,
    },
    {
      region: ForecastRegion.west,
      minLat: ForecastRegionMap.CENTRAL_SOUTH_LAT,
      maxLat: ForecastRegionMap.CENTRAL_NORTH_LAT,
      minLon: ForecastRegionMap.BOUNDS.minLon,
      maxLon: ForecastRegionMap.CENTRAL_WEST_LON,
    },
    {
      region: ForecastRegion.central,
      minLat: ForecastRegionMap.CENTRAL_SOUTH_LAT,
      maxLat: ForecastRegionMap.CENTRAL_NORTH_LAT,
      minLon: ForecastRegionMap.CENTRAL_WEST_LON,
      maxLon: ForecastRegionMap.CENTRAL_EAST_LON,
    },
    {
      region: ForecastRegion.east,
      minLat: ForecastRegionMap.CENTRAL_SOUTH_LAT,
      maxLat: ForecastRegionMap.CENTRAL_NORTH_LAT,
      minLon: ForecastRegionMap.CENTRAL_EAST_LON,
      maxLon: ForecastRegionMap.BOUNDS.maxLon,
    },
  ];

  /**
   * 1.3.2 — the region whose polygon contains the point.
   *
   * Containment is answered here rather than through `Polygon.contains`, which throws on purpose:
   * that method's warning is about *cluster* boundaries, where a second in-process answer would
   * compete with PostGIS's stored exposure status (3.1.8, 5.1.7). These five rectangles are static
   * configuration, they are never stored as geometry, and nothing else will ever ask a database
   * about them — so there is exactly one answer to this question, which is what the warning wants.
   *
   * Written as an ordered cascade rather than a loop over the boxes, because the ordering *is* the
   * proof: every point inside the bounds falls out of exactly one branch, so "exactly one region"
   * (1.3.2) holds by construction and not by the test data happening to behave.
   *
   * @returns the containing region, or `null` when the point lies outside Singapore's box entirely
   */
  static containing(point: GeoPoint): ForecastRegion | null {
    const { latitude: lat, longitude: lon } = point;
    const bounds = ForecastRegionMap.BOUNDS;
    if (lat < bounds.minLat || lat > bounds.maxLat || lon < bounds.minLon || lon > bounds.maxLon) {
      return null;
    }
    if (lat >= ForecastRegionMap.CENTRAL_NORTH_LAT) {
      return ForecastRegion.north;
    }
    if (lat < ForecastRegionMap.CENTRAL_SOUTH_LAT) {
      return ForecastRegion.south;
    }
    if (lon < ForecastRegionMap.CENTRAL_WEST_LON) {
      return ForecastRegion.west;
    }
    return lon <= ForecastRegionMap.CENTRAL_EAST_LON ? ForecastRegion.central : ForecastRegion.east;
  }

  /**
   * 1.3.2 — the assignment used by the ingestion job: containment first, nearest-region-centroid
   * as the fallback.
   *
   * The fallback is not decoration. Pulau Tekong and the southern islands sit inside the feed and
   * outside a tidy box, and a cluster with **no** region is a cluster the heavy-rain driver silently
   * skips — which is worse than a coarse answer, because it looks like "no rain expected".
   */
  static assign(point: GeoPoint): ForecastRegion {
    return ForecastRegionMap.containing(point) ?? ForecastRegionMap.nearest(point);
  }

  /** The region whose box centre is closest, by great-circle distance. */
  static nearest(point: GeoPoint): ForecastRegion {
    let best = ForecastRegion.central;
    let bestMetres = Number.POSITIVE_INFINITY;
    for (const box of ForecastRegionMap.BOXES) {
      const metres = point.distanceTo(ForecastRegionMap.centreOf(box));
      if (metres < bestMetres) {
        bestMetres = metres;
        best = box.region;
      }
    }
    return best;
  }

  /** The region rectangles as polygons, for the map layer and for anything that wants to draw them. */
  static polygons(): Array<{ region: ForecastRegion; polygon: Polygon }> {
    return ForecastRegionMap.BOXES.map((box) => ({
      region: box.region,
      polygon: new Polygon([
        [
          new GeoPoint(box.minLat, box.minLon),
          new GeoPoint(box.minLat, box.maxLon),
          new GeoPoint(box.maxLat, box.maxLon),
          new GeoPoint(box.maxLat, box.minLon),
          new GeoPoint(box.minLat, box.minLon),
        ],
      ]),
    }));
  }

  private static centreOf(box: RegionBox): GeoPoint {
    return new GeoPoint((box.minLat + box.maxLat) / 2, (box.minLon + box.maxLon) / 2);
  }
}
