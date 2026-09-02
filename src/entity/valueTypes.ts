/**
 * D-Fence — value types promoted from attributes (Fox pp. 341-345, heuristic 5)
 * Stereotype: <<value>>. Traces: 1.2.5, 3.1.8, 4.1.x, 5.1.7
 */


export type Uuid = string;
/** Calendar date, ISO 8601 `YYYY-MM-DD`. Distinct from Date: a scheduled date has no time. */
export type IsoDate = string;

/**
 * A WGS-84 point. Exists as a type because latitude and longitude travelled together through
 * nine classes as loose numbers, which is where argument-order bugs come from.
 */
export class GeoPoint {
  constructor(readonly latitude: number, readonly longitude: number) {}

  /** Great-circle distance in metres. Used by 1.2.5 (nearest three rainfall stations). */
  distanceTo(_other: GeoPoint): number {
    // TODO(F4): haversine. Kept in application code deliberately — this one is not a query.
    throw new Error('not implemented');
  }
}

/** A cluster boundary. Point-in-polygon is answered by PostGIS, not here — see contains(). */
export class Polygon {
  constructor(readonly rings: GeoPoint[][]) {}

  /**
   * Client-side containment, for map interaction only. The authoritative answer for 3.1.8 and
   * 5.1.7 comes from ClusterRepository, which asks PostGIS. Two implementations of the same
   * predicate is a real risk; this one must never be used for a stored exposure status.
   */
  contains(_p: GeoPoint): boolean {
    throw new Error('not implemented');
  }

  toGeoJson(): string {
    throw new Error('not implemented');
  }
}

/** The three premises counts NEA publishes. Always read together, always summed. */
export class PremisesMix {
  constructor(
    readonly homes: number,
    readonly publicPlaces: number,
    readonly constructionSites: number,
  ) {}

  total(): number {
    return this.homes + this.publicPlaces + this.constructionSites;
  }
}

/** Tier cut-offs. 4.1.x; held in configuration, not in code (10.6.2). */
export class TierThresholds {
  constructor(readonly high: number, readonly medium: number) {}
}
