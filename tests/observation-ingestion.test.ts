/**
 * D-Fence — Lab 4 §6.5: observation ingestion, requirement group 1.5.
 *
 * Cases B1–B8, designed in `lab4/TEST-PLAN.md` before the code existed and executed here.
 *
 * **B2 and B3 are boundary cases in the §2.2 sense.** 500 metres and 90 days are stated in the
 * requirements, so an implementation using `>` where it should use `>=` fails exactly here and
 * nowhere else in the suite.
 *
 * Every case pins the retrieval date rather than reading the clock. That is a direct consequence of
 * rainfall J2: a dated fixture judged against `Date.now()` passes today and fails on demo day, and
 * the failure it produces points at the wrong component.
 */
import { describe, expect, it } from 'vitest';
import {
  INaturalistGateway,
  MAX_POSITIONAL_ACCURACY_M,
  OBSERVATION_WINDOW_DAYS,
  RawObservation,
} from '../src/boundary/gateways/INaturalistGateway';
import {
  ObservationIngestionJob,
  RETRY_ATTEMPTS,
  RETRY_INTERVAL_MS,
} from '../src/control/ingestion/ObservationIngestionJob';
import { InMemoryIngestionRunStore } from '../src/persistence/memory/InMemoryStores';
import { InMemoryObservationStore } from '../src/persistence/memory/InMemoryPestReferenceStores';
import { ObservationSource } from '../src/ports/ExternalGateway';
import { ClusterLocator } from '../src/ports/Stores';
import { Cluster } from '../src/entity/Cluster';
import { PestProfile, TIER_A_DRIVERS } from '../src/entity/PestProfile';
import { Driver, EvidenceTier, PestClass, PestType, SourceKind } from '../src/entity/enums';
import { GeoPoint } from '../src/entity/valueTypes';
import { RawPayload } from '../src/ports/types';

/** The run's retrieval date. Fixed, so 1.5.5's window is measured from a value the test owns. */
const RETRIEVED_AT = new Date('2026-09-16T02:00:00Z');

/** Snake: tier B, taxon 85553 — Serpentes, resolved by id. `q=Serpentes` returns Squamata. */
const SNAKE = new PestProfile(
  PestType.Snake,
  PestClass.Wildlife,
  EvidenceTier.B,
  0.75,
  new Map<Driver, number>(TIER_A_DRIVERS.map((d) => [d, 1 / TIER_A_DRIVERS.length])),
  'AVS (NParks Animal Response Centre)',
  '1800 476 1600',
  85553,
);

function daysBefore(days: number): string {
  return new Date(RETRIEVED_AT.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

/** A record that passes every rule, so each case can break exactly one thing. */
function admissible(overrides: Partial<RawObservation> = {}): RawObservation {
  return {
    id: 1,
    observed_on: daysBefore(3),
    taxon: { name: 'Ptyas korros' },
    geojson: { coordinates: [103.8, 1.34] },
    positional_accuracy: 20,
    quality_grade: 'research',
    obscured: false,
    ...overrides,
  };
}

class FakeObservationSource implements ObservationSource {
  calls: Array<{ taxonId: number; since: string }> = [];
  constructor(
    private readonly results: RawObservation[],
    private readonly failures = 0,
  ) {}
  sourceKind(): SourceKind {
    return SourceKind.Observations;
  }
  async isHealthy(): Promise<boolean> {
    return true;
  }
  async fetchObservations(taxonId: number, since: string): Promise<RawPayload> {
    this.calls.push({ taxonId, since });
    if (this.calls.length <= this.failures) {
      throw new Error('iNaturalist unavailable');
    }
    return { retrievedAt: RETRIEVED_AT, body: { results: this.results } };
  }
}

/** Every point inside Singapore's rough box binds; anything else binds to nothing (1.5.10). */
class FakeLocator implements ClusterLocator {
  async containing(point: GeoPoint): Promise<Cluster | null> {
    const inside =
      point.latitude > 1.2 && point.latitude < 1.5 && point.longitude > 103.6 && point.longitude < 104.1;
    if (!inside) {
      return null;
    }
    return Object.assign(new Cluster(), { id: 'loc-1', locality: 'Bedok North Ave 1' });
  }
  async nearestWithin(): Promise<{ cluster: Cluster; distanceMetres: number } | null> {
    return null;
  }
}

function job(
  results: RawObservation[],
  opts: { failures?: number; observations?: InMemoryObservationStore } = {},
): {
  run: ObservationIngestionJob;
  source: FakeObservationSource;
  store: InMemoryObservationStore;
  sleeps: number[];
} {
  const source = new FakeObservationSource(results, opts.failures ?? 0);
  const store = opts.observations ?? new InMemoryObservationStore();
  const sleeps: number[] = [];
  const run = new ObservationIngestionJob(
    source,
    new InMemoryIngestionRunStore(),
    store,
    new FakeLocator(),
    SNAKE,
    async (ms) => {
      sleeps.push(ms);
    },
    () => RETRIEVED_AT,
  );
  return { run, source, store, sleeps };
}

describe('EC: admissibility at the boundary (1.5.4-1.5.7)', () => {
  it('B1 — an obscured record is rejected (1.5.6)', () => {
    // The one to run against a real payload before trusting any of it: macaque, otter and pangolin
    // sampled 100% obscured on 2026-09-16. An obscured coordinate is randomised across a 22 km box,
    // so admitting one is not a wrong number — it is a fabricated one.
    expect(INaturalistGateway.isAdmissible(admissible({ obscured: true }), RETRIEVED_AT)).toBe('obscured');
    expect(INaturalistGateway.isAdmissible(admissible(), RETRIEVED_AT)).toBeNull();
  });

  it('B2 — positional accuracy 500 is accepted and 501 is rejected (1.5.7)', () => {
    const at = (m: number): string | null =>
      INaturalistGateway.isAdmissible(admissible({ positional_accuracy: m }), RETRIEVED_AT);

    // 1.5.7 says "exceeds 500 metres", so 500 itself is admissible. This pair is the whole case.
    expect(at(MAX_POSITIONAL_ACCURACY_M)).toBeNull();
    expect(at(MAX_POSITIONAL_ACCURACY_M + 1)).toBe('imprecise');
    // Absent is not the same as bad: most older records report no accuracy at all, and rejecting
    // them would discard the majority of the window.
    expect(at.call(null, 0)).toBeNull();
    expect(INaturalistGateway.isAdmissible(admissible({ positional_accuracy: null }), RETRIEVED_AT)).toBeNull();
  });

  it('B3 — observed 90 days ago is accepted and 91 days ago is rejected (1.5.5)', () => {
    const at = (days: number): string | null =>
      INaturalistGateway.isAdmissible(admissible({ observed_on: daysBefore(days) }), RETRIEVED_AT);

    expect(at(OBSERVATION_WINDOW_DAYS)).toBeNull();
    expect(at(OBSERVATION_WINDOW_DAYS + 1)).toBe('tooOld');
  });

  it('B4 — a record with no latitude is rejected (1.5.4)', () => {
    const noGeometry = admissible({ geojson: null, location: null });
    expect(INaturalistGateway.isAdmissible(noGeometry, RETRIEVED_AT)).toBe('missingField');
    expect(INaturalistGateway.isAdmissible(admissible({ observed_on: null }), RETRIEVED_AT)).toBe('missingField');
  });

  it('B4b — the two coordinate forms are read with their own conventions, not one another"s', () => {
    // geojson is [lng, lat] as GeoJSON requires; the `location` string is "lat,lng". Reading either
    // with the other"s convention puts Singapore in the Indian Ocean, and the symptom is not a bad
    // coordinate but an empty feed: every record binds to no locality and 1.5.10 discards it.
    expect(INaturalistGateway.coordinatesOf({ geojson: { coordinates: [103.8, 1.34] } })).toEqual({
      latitude: 1.34,
      longitude: 103.8,
    });
    expect(INaturalistGateway.coordinatesOf({ location: '1.34,103.8' })).toEqual({
      latitude: 1.34,
      longitude: 103.8,
    });
  });
});

describe('The observation ingestion job (1.5.8-1.5.14)', () => {
  it('B5 — a batch of 10 with 4 rejected records the count under each rule (1.5.8)', async () => {
    const { run, store } = job([
      admissible({ id: 1 }),
      admissible({ id: 2 }),
      admissible({ id: 3 }),
      admissible({ id: 4 }),
      admissible({ id: 5 }),
      admissible({ id: 6 }),
      admissible({ id: 7, obscured: true }),
      admissible({ id: 8, positional_accuracy: 900 }),
      admissible({ id: 9, observed_on: daysBefore(120) }),
      admissible({ id: 10, geojson: null, location: null }),
    ]);

    const result = await run.run();

    // Per rule, not merely a total. "Four were rejected" and "one of each of the four rules fired"
    // are different facts, and only the second one tells anyone whether the feed or the filter is
    // the thing that changed.
    expect(run.rejections).toEqual({ obscured: 1, imprecise: 1, tooOld: 1, missingField: 1 });
    expect(result.featureCount).toBe(6);
    expect(await store.all()).toHaveLength(6);
  });

  it('B6 — the same batch twice stores each record once (1.5.11)', async () => {
    const batch = [admissible({ id: 11 }), admissible({ id: 12 })];
    const store = new InMemoryObservationStore();

    const first = await job(batch, { observations: store }).run.run();
    const second = await job(batch, { observations: store }).run.run();

    expect(first.featureCount).toBe(2);
    // Runs overlap by design — a 90-day window re-presents almost everything each time. Counting
    // the overlap again would inflate the density driver by exactly the overlap.
    expect(second.featureCount).toBe(0);
    expect(await store.all()).toHaveLength(2);
  });

  it('B7 — a record outside every locality is discarded (1.5.10)', async () => {
    const { run, store } = job([
      admissible({ id: 21 }),
      admissible({ id: 22, geojson: { coordinates: [120.0, 20.0] } }),
    ]);

    const result = await run.run();

    expect(result.featureCount).toBe(1);
    expect(run.unbound).toBe(1);
    // Discarded, not attached to the nearest locality. A sighting"s value is its location, so
    // inventing one for it is worse than dropping it.
    expect((await store.all()).map((o) => o.observationId)).toEqual(['21']);
  });

  it('B8 — a failing retrieval is retried three times at five minutes, then last-good is served (1.5.12, 1.5.13)', async () => {
    const store = new InMemoryObservationStore();
    await job([admissible({ id: 31 })], { observations: store }).run.run();

    const { run, source, sleeps } = job([], { failures: 99, observations: store });
    const result = await run.run();

    expect(source.calls).toHaveLength(RETRY_ATTEMPTS);
    // Two waits, not three: the interval sits *between* attempts, and sleeping after the last one
    // delays the failure by five minutes without ever retrying again.
    expect(sleeps).toEqual([RETRY_INTERVAL_MS, RETRY_INTERVAL_MS]);
    expect(result.outcome).toBe('FAILED');
    // 1.5.13 — the previously stored observations are untouched by a failed cycle.
    expect(await store.all()).toHaveLength(1);
  });

  it('B9 — the run records the pest type and both counts (1.5.14)', async () => {
    const { run } = job([admissible({ id: 41 }), admissible({ id: 42, obscured: true })]);

    const result = await run.run();

    expect(result.pestType).toBe(PestType.Snake);
    expect(result.acceptedCount).toBe(1);
    expect(result.rejectedCount).toBe(1);
  });

  it('B10 — the taxon id comes from the profile, and the window is 90 days (1.5.2, 1.5.5)', async () => {
    const { run, source } = job([]);

    await run.run();

    // 85553, not 26172. Resolving by name would have sent Squamata — the whole order, monitor
    // lizards included — and overcounted snakes roughly threefold.
    expect(source.calls[0]?.taxonId).toBe(85553);
    expect(source.calls[0]?.since).toBe(daysBefore(OBSERVATION_WINDOW_DAYS));
  });
});
