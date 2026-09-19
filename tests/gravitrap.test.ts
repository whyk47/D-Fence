/**
 * D-Fence — the Gravitrap feed. Design: lab4/TEST-PLAN.md §6.16.
 *
 * Step 9 of PEST-PRIORITY-MODEL.md §8 was refused for three reasons, all of them about *scoring*
 * the feed: an eighth tier A driver contradicts 4.2.5 as written, has no requirement behind it,
 * and would redistribute seven weights each argued for individually. None of the three is an
 * objection to collecting the evidence, so the feed is ingested, stored and dated, and nothing
 * reads it into a score.
 *
 * The cases below are therefore about the ingestion and about that last sentence — G6 exists to
 * fail if anyone quietly wires the feed into the model without touching the requirement first.
 */
import { describe, expect, it } from 'vitest';
import { GravitrapIngestionJob } from '../src/control/ingestion/GravitrapIngestionJob';
import { HighAedesAreaSource } from '../src/boundary/gateways/GravitrapGateway';
import { InMemoryHighAedesAreaStore } from '../src/persistence/HighAedesAreaRepository';
import { InMemoryIngestionRunStore } from '../src/persistence/memory/InMemoryStores';
import { HighAedesArea } from '../src/entity/HighAedesArea';
import { SourceKind } from '../src/entity/enums';
import { TIER_A_DRIVERS } from '../src/entity/PestProfile';
import { RawPayload } from '../src/ports/types';

/** A square, as GeoJSON gives it: [longitude, latitude], closed. */
function square(lng: number, lat: number, size = 0.01): Array<Array<[number, number]>> {
  return [
    [
      [lng, lat],
      [lng + size, lat],
      [lng + size, lat + size],
      [lng, lat + size],
      [lng, lat],
    ],
  ];
}

function feature(objectId: unknown, name: string, geometry: unknown): unknown {
  return {
    type: 'Feature',
    properties: { OBJECTID: objectId, NAME: name, DESCRIPTION: 'test area' },
    geometry,
  };
}

class FakeSource implements HighAedesAreaSource {
  fetches = 0;

  constructor(
    private readonly body: unknown,
    private stamp: string | null = '2026-08-29T10:06:44+08:00',
  ) {}

  sourceKind(): SourceKind {
    return SourceKind.Gravitrap;
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async fetchLastUpdatedAt(): Promise<string | null> {
    return this.stamp;
  }

  async fetchAreas(): Promise<RawPayload> {
    this.fetches += 1;
    return { retrievedAt: new Date('2026-09-19T00:00:00Z'), body: this.body };
  }

  republish(stamp: string): void {
    this.stamp = stamp;
  }
}

function job(source: FakeSource): {
  job: GravitrapIngestionJob;
  areas: InMemoryHighAedesAreaStore;
  runs: InMemoryIngestionRunStore;
} {
  const runs = new InMemoryIngestionRunStore();
  const areas = new InMemoryHighAedesAreaStore();
  return { job: new GravitrapIngestionJob(source, runs, areas), areas, runs };
}

describe('G: the Gravitrap feed is ingested, dated and not scored — §8 step 9', () => {
  it('G1 — a Polygon and a MultiPolygon both arrive as areas', async () => {
    const source = new FakeSource({
      features: [
        feature(1, 'Polygon area', { type: 'Polygon', coordinates: square(103.8, 1.3) }),
        feature(2, 'Multi area', {
          type: 'MultiPolygon',
          coordinates: [square(103.85, 1.35), square(103.9, 1.4)],
        }),
      ],
    });
    const { job: j, areas } = job(source);
    await j.run();

    const stored = await areas.all();
    // The two GeoJSON shapes differ by exactly one level of nesting, and the publisher uses both
    // across its datasets. Normalised at parse time so nothing downstream has to ask which it got.
    expect(stored).toHaveLength(2);
    expect(stored[0]?.polygons).toHaveLength(1);
    expect(stored[1]?.polygons).toHaveLength(2);
  });

  it('G2 — a feature with no id or no geometry is counted, not thrown', async () => {
    const source = new FakeSource({
      features: [
        feature(1, 'Good', { type: 'Polygon', coordinates: square(103.8, 1.3) }),
        feature(null, 'No id', { type: 'Polygon', coordinates: square(103.81, 1.31) }),
        feature(3, 'No geometry', undefined),
        feature(4, 'Three points', { type: 'Polygon', coordinates: [[[103.8, 1.3], [103.81, 1.3], [103.8, 1.3]]] }),
      ],
    });
    const { job: j, areas } = job(source);
    const run = await j.run();

    // 1.1.17 — one malformed feature must not discard the several hundred around it. A ring of
    // three points is not a closed polygon and PostGIS would reject it on insert, which is a
    // failure of the whole transaction rather than of the one feature that caused it.
    expect((await areas.all())).toHaveLength(1);
    expect(j.rejected).toBe(3);
    expect(run.outcome).toBe('SUCCESS');
  });

  it('G3 — the publisher stamp is stored and the payload is not fetched again (1.1.19, 1.1.20)', async () => {
    const source = new FakeSource({
      features: [feature(1, 'Area', { type: 'Polygon', coordinates: square(103.8, 1.3) })],
    });
    const { job: j, runs } = job(source);

    await j.run();
    const second = await j.run();

    // 420 KB against a file that moved once in ten months. The second run is UNCHANGED, which
    // 1.1.21 counts as a success: a skipped download is evidence the source is alive.
    expect(source.fetches).toBe(1);
    expect(second.outcome).toBe('UNCHANGED');
    expect(await runs.lastPublisherStamp(SourceKind.Gravitrap)).toBe('2026-08-29T10:06:44+08:00');
  });

  it('G4 — a republication is fetched again', async () => {
    const source = new FakeSource({
      features: [feature(1, 'Area', { type: 'Polygon', coordinates: square(103.8, 1.3) })],
    });
    const { job: j } = job(source);

    await j.run();
    source.republish('2026-09-19T10:06:44+08:00');
    const third = await j.run();

    expect(source.fetches).toBe(2);
    expect(third.outcome).toBe('SUCCESS');
  });

  it('G5 — a feed that parsed to nothing does not empty the store', async () => {
    const source = new FakeSource({
      features: [feature(1, 'Area', { type: 'Polygon', coordinates: square(103.8, 1.3) })],
    });
    const { job: j, areas } = job(source);
    await j.run();

    // One bad download must not become a deletion. 10.2.2 keeps the last good data available, and
    // an empty set here would read as "there are no high-Aedes areas in Singapore" — a claim, not
    // an absence.
    expect(await areas.replaceAll([], null)).toBe(0);
    expect(await areas.all()).toHaveLength(1);
  });

  it('G6 — the feed reaches no score, which is the decision §8 records', () => {
    // The guard on step 9's open decision. Adding the feed to the model means redistributing seven
    // tier A weights that were each argued for individually and re-cutting the 4.2.5 goldens; this
    // case fails first if anyone does it without touching the requirement.
    expect(TIER_A_DRIVERS).toHaveLength(7);
    expect(TIER_A_DRIVERS.map(String).join(',')).not.toMatch(/aedes|gravitrap/i);
  });

  it('G7 — a label point is the mean of a ring, and is never used for containment', () => {
    // `square` returns one polygon's rings; the entity holds a list of polygons.
    const area = new HighAedesArea('1', 'Area', '', [square(103.8, 1.3)]);
    const point = area.labelPoint();

    // The centroid of the ring's vertices, which is not the centroid of the area and is not claimed
    // to be. Containment is `ST_Intersects` in the repository, against the polygon itself — the
    // in-memory store answers `localityIdsInAreas` with nothing rather than approximating it,
    // because two implementations of one spatial predicate is the bug `Polygon.contains` refuses
    // to make possible.
    expect(point?.longitude).toBeCloseTo(103.804, 3);
    expect(point?.latitude).toBeCloseTo(1.304, 3);
    expect(new HighAedesArea('2', 'Empty', '', []).labelPoint()).toBeNull();
  });
});
