/**
 * D-Fence — OperatorRegistryLoader.
 * Stereotype: <<control>>. Traces: 1.6.1, 1.6.4, 1.6.5, 1.6.6, 1.6.8, 4.1.25.
 *
 * Loads the operator registry once at start-up and geocodes it.
 *
 * **Deliberately not an `AbstractIngestionJob`.** The template exists for feeds: it records runs,
 * marks sources stale, and serves the last good data when a cycle fails (10.2.2–10.2.4). None of
 * that means anything for a dataset that was last published in 2024 and will not change while the
 * process runs. Fitting this to the template would produce an `IngestionRun` history implying a
 * recurring fetch, and 1.6.7 exists precisely to stop this registry being read as live.
 *
 * The expensive part is 290 geocodes, so 1.6.5's cache is the difference between a start-up that
 * takes seconds and one that takes minutes. The cache is keyed by postal code rather than by
 * address, which matters more than it looks: 290 operators occupy far fewer than 290 postal codes
 * — several share an office building — and a per-address key would re-resolve each of them.
 */
import { GeocodingSource, OperatorRegistrySource } from '../ports/ExternalGateway';
import { OperatorRegistryStore } from '../ports/Stores';
import { VCORegistryGateway } from '../boundary/gateways/VCORegistryGateway';
import { VectorControlOperator } from '../entity/VectorControlOperator';
import { GeoPoint } from '../entity/valueTypes';

export interface RegistryLoadResult {
  /** Rows accepted by 1.6.3 and successfully geocoded. */
  loaded: number;
  /** Rows accepted by 1.6.3 whose postal code the geocoder could not resolve. Kept, not dropped. */
  ungeocoded: number;
  /** 1.6.5 — how many geocoder calls the cache avoided. Zero on a cold start, by definition. */
  cacheHits: number;
  /** True when 1.6.6 applied: the load failed and the previously stored registry was retained. */
  retainedPrevious: boolean;
}

export class OperatorRegistryLoader {
  constructor(
    private readonly registrySource: OperatorRegistrySource,
    private readonly geocoder: GeocodingSource,
    private readonly store: OperatorRegistryStore,
  ) {}

  /**
   * 1.6.1. Safe to call when the source is unreachable: 1.6.6 says the previous registry survives,
   * so a failure here must never leave the store emptier than it found it. The store is written
   * once, at the end, for that reason — a partial write during a failing load is exactly the state
   * 1.6.6 forbids.
   */
  async load(): Promise<RegistryLoadResult> {
    let csv: string;
    let publishedAt: Date | null;
    try {
      const raw = await this.registrySource.fetchRegistry();
      csv = String(raw.body);
      publishedAt = await this.registrySource.fetchPublishedAt();
    } catch {
      return { loaded: 0, ungeocoded: 0, cacheHits: 0, retainedPrevious: true };
    }

    const parsed = VCORegistryGateway.parse(csv);
    const resolved: VectorControlOperator[] = [];
    let cacheHits = 0;
    let ungeocoded = 0;

    for (const operator of parsed) {
      const cached = await this.store.cachedCoordinate(operator.postalCode);
      if (cached !== null) {
        cacheHits += 1;
        resolved.push(operator.withLocation(cached, publishedAt));
        continue;
      }
      let point: GeoPoint | null;
      try {
        // 1.6.4. The postal code alone is the search term: it is unambiguous, and the full address
        // string is the one the supplier typed, complete with abbreviations a geocoder guesses at.
        const candidates = await this.geocoder.search(operator.postalCode);
        point = candidates[0]?.point ?? null;
      } catch {
        // One address failing to resolve is not the registry failing to load. 1.6.6 is about the
        // latter; this row simply has no coordinate and 1.6.8 will skip it.
        point = null;
      }
      if (point === null) {
        ungeocoded += 1;
        resolved.push(operator);
        continue;
      }
      await this.store.cacheCoordinate(operator.postalCode, point);
      resolved.push(operator.withLocation(point, publishedAt));
    }

    await this.store.saveRegistry(resolved, publishedAt);
    return {
      loaded: resolved.length - ungeocoded,
      ungeocoded,
      cacheHits,
      retainedPrevious: false,
    };
  }

  /**
   * 1.6.8 — straight-line metres from a locality to the nearest registered operator.
   *
   * @returns null when no operator has a coordinate. Null rather than Infinity or the cap: the
   *   driver's 4.1.9 renormalisation is built to exclude a driver whose value is unknown, and
   *   handing it the cap instead would score "we have no registry" identically to "the nearest
   *   operator is 8 km away", which are not the same claim.
   */
  static nearestOperatorMetres(from: GeoPoint, operators: VectorControlOperator[]): number | null {
    let nearest: number | null = null;
    for (const operator of operators) {
      if (operator.location === null) {
        continue;
      }
      const metres = from.distanceTo(operator.location);
      if (nearest === null || metres < nearest) {
        nearest = metres;
      }
    }
    return nearest;
  }
}
