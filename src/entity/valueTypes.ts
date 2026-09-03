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

  /**
   * Great-circle distance in metres (haversine). Used by 1.2.5, nearest three rainfall stations.
   * Kept in application code deliberately: unlike containment, this one runs over 97 stations held
   * in memory, so a database round trip would cost more than the arithmetic saves.
   */
  distanceTo(other: GeoPoint): number {
    const R = 6_371_000; // mean Earth radius, metres
    const toRad = (d: number): number => (d * Math.PI) / 180;
    const dLat = toRad(other.latitude - this.latitude);
    const dLon = toRad(other.longitude - this.longitude);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(this.latitude)) * Math.cos(toRad(other.latitude)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
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

/**
 * The three premises fields NEA publishes. Always read together.
 *
 * **These are not counts.** A live payload on 2026-09-03 shows each field is comma-separated free
 * text naming the *breeding-habitat types* found in that premises category — HOMES = "Domestic
 * container, Bin, Flower pot, Vase…" — and each is frequently null. The class held three numbers
 * until then, which is why requirement 1.1.15 was specified as arithmetic that could not run.
 * Traces: 1.1.15, 1.1.16, 1.1.23, 4.1.21.
 */
export class PremisesMix {
  constructor(
    readonly homes: string[] = [],
    readonly publicPlaces: string[] = [],
    readonly constructionSites: string[] = [],
  ) {}

  /** Total habitat types listed across all three premises categories. */
  total(): number {
    return this.homes.length + this.publicPlaces.length + this.constructionSites.length;
  }

  /**
   * 1.1.15 — habitat types outside homes as a share of all listed, in [0, 1].
   * 1.1.16 — 0 when nothing is listed, which on the 2026-09-03 payload is 8 of 12 clusters.
   */
  ratio(): number {
    const total = this.total();
    return total === 0 ? 0 : (this.publicPlaces.length + this.constructionSites.length) / total;
  }
}

/** Tier cut-offs. 4.1.x; held in configuration, not in code (10.6.2). */
export class TierThresholds {
  constructor(readonly high: number, readonly medium: number) {}
}
