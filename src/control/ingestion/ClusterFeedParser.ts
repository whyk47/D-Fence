/**
 * D-Fence — ClusterFeedParser.
 * Stereotype: <<control>>. Traces: 1.1.2, 1.1.3, 1.1.15, 1.1.16, 1.1.20, 1.1.22, 1.1.23.
 *
 * Pure functions over the NEA Dengue Clusters GeoJSON. Pure because everything here is decided by
 * the payload alone, which makes it unit-testable without a network (10.6.3) and makes the Lab 4
 * test cases reproducible against a fixture rather than against whatever NEA published this morning.
 *
 * **What the feed actually gives** (dataset d_dbfabf16158d1b0e1c420627c0819168, read 2026-09-03):
 * HOMES, PUBLIC_PLACES and CONSTRUCTION_SITES are NOT counts. They are comma-separated free text
 * listing breeding-habitat types found in that premises category — "Domestic container, Bin, Flower
 * pot, Vase, Ornamental container…" — and are frequently null. Requirement 1.1.15 was rewritten in
 * v0.5 around that fact; this file is where the rewrite is implemented.
 */

/** One feature's properties, as published. Every field is optional because 1.1.3 must reject. */
export interface RawClusterProperties {
  OBJECTID?: number | string;
  LOCALITY?: string;
  CASE_SIZE?: number | string;
  HOMES?: string | null;
  PUBLIC_PLACES?: string | null;
  CONSTRUCTION_SITES?: string | null;
  INC_CRC?: string | null;
  FMEL_UPD_D?: string | number | null;
}

/** A feature accepted under 1.1.3, with the derived values 1.1.15 and 1.1.23 define. */
export interface ParsedCluster {
  objectId: string;
  locality: string;
  caseSize: number;
  homeHabitats: string[];
  publicPlaceHabitats: string[];
  constructionSiteHabitats: string[];
  premisesMix: number;
  incCrc: string | null;
  feedUpdatedAt: string | null;
}

export interface RejectedFeature {
  objectId: string | null;
  missingField: string;
}

export class ClusterFeedParser {
  /**
   * 1.1.23 — comma-separated habitat names; null or empty is an empty list.
   * Blank fragments are dropped rather than counted: the feed's own text often has a trailing
   * comma, and counting an empty fragment would inflate the premises-mix denominator.
   */
  static parseHabitatList(field: string | null | undefined): string[] {
    if (field === null || field === undefined) {
      return [];
    }
    return field
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }

  /**
   * 1.1.15 — habitat types outside homes as a share of all habitat types listed.
   * 1.1.16 — 0 when nothing is listed at all, which on the 2026-09-03 payload is 8 of 12 clusters.
   * Returning 0 rather than null keeps the driver computable for every cluster; SCORING-SPEC.md §3
   * is where the sparsity is answered, by holding this driver's weight at 0.05.
   */
  static computePremisesMix(homes: string[], publicPlaces: string[], constructionSites: string[]): number {
    const outsideHomes = publicPlaces.length + constructionSites.length;
    const total = homes.length + outsideHomes;
    if (total === 0) {
      return 0;
    }
    return outsideHomes / total;
  }

  /**
   * 1.1.3 / 1.1.17 — reject a feature missing OBJECTID, LOCALITY, CASE_SIZE or geometry, name the
   * missing field for the 1.1.4 log, and carry on with the rest of the batch.
   *
   * @param geometryPresent whether the feature carried geometry; the caller owns the GeoJSON shape
   *   so that this function stays a pure function of properties.
   */
  static parseFeature(
    props: RawClusterProperties,
    geometryPresent: boolean,
  ): { accepted: ParsedCluster } | { rejected: RejectedFeature } {
    const objectId = props.OBJECTID === undefined || props.OBJECTID === null ? null : String(props.OBJECTID);
    const missing = ClusterFeedParser.firstMissingField(props, geometryPresent);
    if (missing !== null) {
      return { rejected: { objectId, missingField: missing } };
    }

    const homes = ClusterFeedParser.parseHabitatList(props.HOMES);
    const publicPlaces = ClusterFeedParser.parseHabitatList(props.PUBLIC_PLACES);
    const constructionSites = ClusterFeedParser.parseHabitatList(props.CONSTRUCTION_SITES);

    return {
      accepted: {
        objectId: objectId as string,
        locality: (props.LOCALITY as string).trim(),
        caseSize: Number(props.CASE_SIZE),
        homeHabitats: homes,
        publicPlaceHabitats: publicPlaces,
        constructionSiteHabitats: constructionSites,
        premisesMix: ClusterFeedParser.computePremisesMix(homes, publicPlaces, constructionSites),
        incCrc: props.INC_CRC ?? null,
        feedUpdatedAt: props.FMEL_UPD_D === undefined || props.FMEL_UPD_D === null ? null : String(props.FMEL_UPD_D),
      },
    };
  }

  /** @returns the name of the first field 1.1.3 requires and the feature does not have, or null. */
  private static firstMissingField(props: RawClusterProperties, geometryPresent: boolean): string | null {
    if (props.OBJECTID === undefined || props.OBJECTID === null || String(props.OBJECTID).trim() === '') {
      return 'OBJECTID';
    }
    if (typeof props.LOCALITY !== 'string' || props.LOCALITY.trim() === '') {
      return 'LOCALITY';
    }
    const caseSize = Number(props.CASE_SIZE);
    if (props.CASE_SIZE === undefined || props.CASE_SIZE === null || Number.isNaN(caseSize)) {
      return 'CASE_SIZE';
    }
    if (!geometryPresent) {
      return 'geometry';
    }
    return null;
  }

  /**
   * 1.1.20 — download only when the publisher's `lastUpdatedAt` has moved.
   *
   * The first cycle after a restart has no recorded value and must download (10.2.3: resume after
   * restart without losing a cycle). An unreadable or absent metadata value also downloads: failing
   * towards a fetch is safe, failing towards a skip would silently freeze the data.
   */
  static shouldDownload(metadataLastUpdatedAt: string | null | undefined, lastRecorded: string | null): boolean {
    if (metadataLastUpdatedAt === null || metadataLastUpdatedAt === undefined || metadataLastUpdatedAt === '') {
      return true;
    }
    if (lastRecorded === null) {
      return true;
    }
    return metadataLastUpdatedAt !== lastRecorded;
  }

  /**
   * 1.1.22 — the publisher's per-feature checksum decides whether a feature changed.
   * A feature that has never been seen counts as changed. A feature whose stored checksum is
   * unknown also counts as changed, because "we cannot tell" must not be recorded as "unchanged".
   */
  static featureChanged(incomingCrc: string | null, storedCrc: string | null): boolean {
    if (incomingCrc === null || storedCrc === null) {
      return true;
    }
    return incomingCrc !== storedCrc;
  }

  /**
   * FMEL_UPD_D is published as `yyyyMMddHHmmss` in Singapore local time — "20260828155154".
   * @returns the instant it denotes, or null if the string is not that shape.
   */
  static parseFeedTimestamp(fmelUpdD: string | null): Date | null {
    if (fmelUpdD === null) {
      return null;
    }
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(fmelUpdD.trim());
    if (m === null) {
      return null;
    }
    const [, y, mo, d, h, mi, sec] = m;
    // +08:00 is stated explicitly rather than relying on the host clock, which on a marker's
    // machine will not be Singapore.
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${sec}+08:00`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
