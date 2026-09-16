/**
 * D-Fence — INaturalistGateway (Adapter).
 * Stereotype: <<boundary>>. Traces: 1.5.1, 1.5.2, 1.5.3, 1.5.4, 1.5.5, 1.5.6, 1.5.7, 10.4.6.
 *
 * **The only live feed that exists for any pest other than the mosquito.** No Singapore government
 * API publishes cockroach, rat, boar or snake reports — checked against all 4,615 data.gov.sg
 * datasets on 2026-09-16. Without this source, tier B would be tier C.
 *
 * `place_id` 6734 is Singapore. The taxon id comes from the pest profile (1.5.2) and is resolved
 * **by id, never by name**: `q=Serpentes` returns 26172, which is Squamata — the whole order,
 * monitor lizards included — and overcounts snakes roughly threefold. Serpentes is 85553. That
 * trap is recorded in `config/pests.default.json` beside the ids themselves.
 *
 * **Admissibility is applied here, at the boundary, not in the job.** Three of the four rejection
 * rules — the obscured flag, the positional accuracy, the observed date — are properties of the
 * supplier's payload rather than of our domain, and a record that fails them should not reach the
 * control layer at all. The counts still travel, because 1.5.8 wants them per rule.
 */
import { ObservationSource } from '../../ports/ExternalGateway';
import { HttpClient } from './HttpClient';
import { SourceKind } from '../../entity/enums';
import { RawPayload } from '../../ports/types';

/** One record as the supplier sends it. Only the fields 1.5.3 names are typed. */
export interface RawObservation {
  id?: number | string;
  observed_on?: string | null;
  taxon?: { name?: string } | null;
  location?: string | null;
  geojson?: { coordinates?: [number, number] } | null;
  positional_accuracy?: number | null;
  quality_grade?: string | null;
  obscured?: boolean;
}

export interface RawObservationPayload {
  total_results?: number;
  results?: RawObservation[];
}

/** 1.5.8 — one counter per rule, so a run says *why* it rejected, not merely how many. */
export interface RejectionCounts {
  missingField: number;
  tooOld: number;
  obscured: number;
  imprecise: number;
}

export const NO_REJECTIONS: RejectionCounts = {
  missingField: 0,
  tooOld: 0,
  obscured: 0,
  imprecise: 0,
};

/** 1.5.7. Stated in the requirement, so it is a constant here and a boundary case in the tests. */
export const MAX_POSITIONAL_ACCURACY_M = 500;
/** 1.5.5. Same. */
export const OBSERVATION_WINDOW_DAYS = 90;

export class INaturalistGateway implements ObservationSource {
  constructor(
    private readonly http: HttpClient,
    private readonly baseUrl = 'https://api.inaturalist.org',
    /** Singapore. Verified 2026-09-16. */
    private readonly placeId = 6734,
  ) {}

  sourceKind(): SourceKind {
    return SourceKind.Observations;
  }

  /**
   * Healthy means "answers with a result set", not "returns 200". An empty page for one taxon is a
   * normal answer — some of these pests are genuinely rare — so health is checked against the
   * envelope, not the count.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const body = (
        await this.http.getJson<RawObservationPayload>(
          `${this.baseUrl}/v1/observations?place_id=${this.placeId}&per_page=1`,
          { attempts: 2 },
        )
      );
      return Array.isArray(body.results);
    } catch {
      return false;
    }
  }

  /** 1.5.1, 1.5.2 — one taxon per call. `since` is `YYYY-MM-DD`. */
  async fetchObservations(taxonId: number, since: string): Promise<RawPayload> {
    const url =
      `${this.baseUrl}/v1/observations` +
      `?taxon_id=${taxonId}` +
      `&place_id=${this.placeId}` +
      `&d1=${encodeURIComponent(since)}` +
      // The supplier will hand back obscured records regardless; asking for them and rejecting
      // them locally is deliberate, so that 1.5.8 can report how many there were. Filtering them
      // server-side would make the count unknowable and the caveat in the model unverifiable.
      `&geo=true&per_page=200`;
    const body = await this.http.getJson<RawObservationPayload>(url, { attempts: 3, timeoutMs: 30_000 });
    return { retrievedAt: new Date(), body };
  }

  /**
   * 1.5.4–1.5.7 at the boundary.
   *
   * Static and pure, so B1–B4 test the rules against a literal record with no network and no clock
   * beyond the one passed in.
   *
   * @param retrievedAt the run's retrieval date — 1.5.5 measures the window from it, not from
   *   `Date.now()`, so a fixture cannot age into failing the way rainfall's J2 did.
   */
  static isAdmissible(raw: RawObservation, retrievedAt: Date): keyof RejectionCounts | null {
    // 1.5.6 first, and not for speed. An obscured record carries a position randomised across a
    // 22 km box; every later rule would be judging a coordinate the supplier invented. Macaque,
    // otter and pangolin sampled 100% obscured on 2026-09-16.
    if (raw.obscured === true) {
      return 'obscured';
    }
    const point = INaturalistGateway.coordinatesOf(raw);
    if (raw.observed_on === undefined || raw.observed_on === null || raw.observed_on === '' || point === null) {
      return 'missingField'; // 1.5.4
    }
    const observedOn = new Date(`${raw.observed_on}T00:00:00Z`);
    if (Number.isNaN(observedOn.getTime())) {
      return 'missingField';
    }
    // 1.5.5 compares two *dates*, so the age is whole days between calendar dates and not elapsed
    // milliseconds. The difference is not pedantry: `observed_on` is a bare date that parses to
    // midnight, so a millisecond comparison makes the rule depend on the time of day the job
    // happens to run — the same record is admitted at 00:30 and rejected at 02:00 the same
    // morning, and the feed quietly shrinks for whoever schedules the cycle later.
    //
    // The calendar is Singapore's, for the reason rainfall J3 records: 16:00 UTC is already
    // tomorrow here, so a UTC calendar is off by one for eight hours out of every twenty-four.
    const ageDays =
      (INaturalistGateway.singaporeMidnightUtc(retrievedAt) - observedOn.getTime()) / 86_400_000;
    // "More than 90 days", so exactly 90 is admitted. B3 sits on this line.
    if (ageDays > OBSERVATION_WINDOW_DAYS) {
      return 'tooOld';
    }
    // 1.5.7 says "exceeds 500 metres", so exactly 500 is admitted and absent is not a failure:
    // an unreported accuracy is not a bad one, and rejecting it would discard most older records.
    if (
      raw.positional_accuracy !== undefined &&
      raw.positional_accuracy !== null &&
      raw.positional_accuracy > MAX_POSITIONAL_ACCURACY_M
    ) {
      return 'imprecise';
    }
    return null;
  }

  /**
   * The instant of midnight, Singapore time, on the day `at` falls in — expressed as a UTC
   * timestamp so it can be subtracted from a parsed `observed_on`.
   */
  static singaporeMidnightUtc(at: Date): number {
    const SGT_OFFSET_MS = 8 * 3_600_000;
    const sgt = at.getTime() + SGT_OFFSET_MS;
    return sgt - (sgt % 86_400_000);
  }

  /**
   * The supplier gives a position two ways and they disagree in order: `geojson.coordinates` is
   * [longitude, latitude] as GeoJSON requires, while the `location` string is "lat,lng". Reading
   * either one with the other's convention puts Singapore in the Indian Ocean, which is the kind
   * of mistake that binds every observation to no locality and looks like an empty feed.
   */
  static coordinatesOf(raw: RawObservation): { latitude: number; longitude: number } | null {
    const geo = raw.geojson?.coordinates;
    if (Array.isArray(geo) && geo.length === 2 && Number.isFinite(geo[0]) && Number.isFinite(geo[1])) {
      return { latitude: geo[1], longitude: geo[0] };
    }
    if (typeof raw.location === 'string' && raw.location.includes(',')) {
      const parts = raw.location.split(',').map((v) => Number(v.trim()));
      const [lat, lng] = [parts[0] ?? NaN, parts[1] ?? NaN];
      if (parts.length === 2 && Number.isFinite(lat) && Number.isFinite(lng)) {
        return { latitude: lat, longitude: lng };
      }
    }
    return null;
  }
}
