/**
 * D-Fence — Lab 4 §3.2: the rainfall path (1.2.x).
 *
 * Every case runs against a fixture, which matters more here than anywhere else in the suite:
 * Singapore was dry on 1–3 September 2026 — three sampled days returned **zero** across every
 * station — so a test that asked the live API to prove the accumulation works would have passed
 * while proving nothing. The fixture carries rain; reality currently does not.
 */
import { describe, expect, it } from 'vitest';
import { RainfallFeedParser, RawRainfallPayload } from '../src/control/ingestion/RainfallFeedParser';
import { RainfallAccumulator } from '../src/control/RainfallAccumulator';
import { RainfallIngestionJob } from '../src/control/ingestion/RainfallIngestionJob';
import { RainfallGateway } from '../src/boundary/gateways/RainfallGateway';
import { HttpClient } from '../src/boundary/gateways/HttpClient';
import { InMemoryIngestionRunStore, InMemoryRainfallStore } from '../src/persistence/memory/InMemoryStores';
import { GeoPoint } from '../src/entity/valueTypes';
import { SourceKind } from '../src/entity/enums';
import { RainfallSource } from '../src/ports/ExternalGateway';
import { RawPayload } from '../src/ports/types';

const NOW = new Date('2026-09-03T12:00:00+08:00');

/** Three stations at known distances from the cluster centroid used below. */
function payload(blocks: Array<{ minutesAgo: number; values: Record<string, number> }>): RawRainfallPayload {
  return {
    data: {
      stations: [
        { id: 'S111', name: 'Near', location: { latitude: 1.3400, longitude: 103.8000 } },
        { id: 'S222', name: 'Middle', location: { latitude: 1.3500, longitude: 103.8000 } },
        { id: 'S333', name: 'Far', location: { latitude: 1.4000, longitude: 103.8000 } },
        { id: 'S444', name: 'Furthest', location: { latitude: 1.5000, longitude: 103.8000 } },
      ],
      readings: blocks.map((b) => ({
        timestamp: new Date(NOW.getTime() - b.minutesAgo * 60_000).toISOString(),
        data: Object.entries(b.values).map(([stationId, value]) => ({ stationId, value })),
      })),
      readingUnit: 'mm',
    },
  };
}

const CENTROID = new GeoPoint(1.34, 103.8);

describe('EC: the rainfall payload parses to stations and readings (1.2.2, 1.2.3)', () => {
  it('R1 — a station without coordinates is dropped, not defaulted to (0, 0)', () => {
    const broken: RawRainfallPayload = {
      data: { stations: [{ id: 'S999', name: 'No location' }, ...(payload([]).data?.stations ?? [])] },
    };
    const stations = RainfallFeedParser.parseStations(broken);
    expect(stations.map((s) => s.stationId)).not.toContain('S999');
    expect(stations).toHaveLength(4);
  });

  it('R2 — every station in a block becomes one reading at the block timestamp', () => {
    const readings = RainfallFeedParser.parseReadings(payload([{ minutesAgo: 5, values: { S111: 1.2, S222: 0 } }]));
    expect(readings).toHaveLength(2);
    expect(readings[0]?.valueMm).toBe(1.2);
  });

  it('R3 — a missing value is skipped, because "did not report" is not "reported no rain"', () => {
    const partial: RawRainfallPayload = {
      data: { readings: [{ timestamp: NOW.toISOString(), data: [{ stationId: 'S111' }, { stationId: 'S222', value: 3 }] }] },
    };
    expect(RainfallFeedParser.parseReadings(partial)).toHaveLength(1);
  });

  it('R4 — 1.2.4 discards a reading more than 30 minutes older than the retrieval', () => {
    const readings = RainfallFeedParser.parseReadings(
      payload([{ minutesAgo: 5, values: { S111: 1 } }, { minutesAgo: 45, values: { S111: 9 } }]),
    );
    const fresh = RainfallFeedParser.freshOnly(readings, NOW);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.valueMm).toBe(1);
  });
});

describe('EC/BV: station assignment and interpolation (1.2.5, 1.2.6)', () => {
  const accumulator = new RainfallAccumulator();
  const stations = RainfallFeedParser.parseStations(payload([]));

  it('A1 — exactly the three nearest stations are assigned, nearest first (1.2.5)', () => {
    const nearest = accumulator.nearestStations(CENTROID, stations);
    expect(nearest.map((n) => n.stationId)).toEqual(['S111', 'S222', 'S333']);
    expect(nearest[0]?.metres).toBeLessThan(nearest[1]?.metres as number);
  });

  it('A2 — the nearest station dominates the weighted mean (1.2.6)', () => {
    const nearest = accumulator.nearestStations(CENTROID, stations);
    const values = new Map([['S111', 10], ['S222', 0], ['S333', 0]]);
    const mean = accumulator.inverseDistanceWeightedMean(values, nearest) as number;
    // An unweighted mean would be 3.33; inverse distance must weight the co-located station far
    // higher, or a distant dry gauge cancels a close wet one.
    expect(mean).toBeGreaterThan(3.34);
  });

  it('A3 — a station at the centroid takes the value outright rather than dividing by zero', () => {
    const here = [{ stationId: 'S111', metres: 0 }, { stationId: 'S222', metres: 1000 }];
    expect(accumulator.inverseDistanceWeightedMean(new Map([['S111', 7], ['S222', 0]]), here)).toBe(7);
  });

  it('A4 — no reading from any assigned station gives null, never 0 (4.1.12)', () => {
    const nearest = accumulator.nearestStations(CENTROID, stations);
    expect(accumulator.inverseDistanceWeightedMean(new Map(), nearest)).toBeNull();
  });
});

describe('EC/BV: rolling accumulations and staleness (1.2.7, 1.2.8, 1.2.10)', () => {
  const accumulator = new RainfallAccumulator();
  const stations = RainfallFeedParser.parseStations(payload([]));

  it('W1 — the 24-hour window sums only what falls inside it, and 72 hours includes more', () => {
    const readings = RainfallFeedParser.parseReadings(
      payload([
        { minutesAgo: 10, values: { S111: 2, S222: 2, S333: 2 } },
        { minutesAgo: 60 * 20, values: { S111: 3, S222: 3, S333: 3 } },
        { minutesAgo: 60 * 40, values: { S111: 5, S222: 5, S333: 5 } },
      ]),
    );
    const rain = accumulator.accumulate(CENTROID, stations, readings, NOW);
    expect(rain.accum24hMm).toBeCloseTo(5, 1);
    expect(rain.accum72hMm).toBeCloseTo(10, 1);
  });

  it('W2 — a reading exactly on the 24-hour boundary is inside the window', () => {
    const readings = RainfallFeedParser.parseReadings(payload([{ minutesAgo: 24 * 60, values: { S111: 4, S222: 4, S333: 4 } }]));
    const rain = accumulator.accumulate(CENTROID, stations, readings, NOW);
    expect(rain.accum24hMm).toBeCloseTo(4, 1);
  });

  it('W3 — windows are measured from the cycle time, so a feed that stopped shows a falling total', () => {
    const readings = RainfallFeedParser.parseReadings(payload([{ minutesAgo: 60 * 30, values: { S111: 6, S222: 6, S333: 6 } }]));
    const rain = accumulator.accumulate(CENTROID, stations, readings, NOW);
    expect(rain.accum24hMm).toBe(0);
    expect(rain.accum72hMm).toBeCloseTo(6, 1);
  });

  it('W4 — nothing accepted for 30 minutes marks rainfall stale (1.2.10)', () => {
    const stale = RainfallFeedParser.parseReadings(payload([{ minutesAgo: 45, values: { S111: 1, S222: 1, S333: 1 } }]));
    const fresh = RainfallFeedParser.parseReadings(payload([{ minutesAgo: 5, values: { S111: 1, S222: 1, S333: 1 } }]));
    expect(accumulator.accumulate(CENTROID, stations, stale, NOW).isStale).toBe(true);
    expect(accumulator.accumulate(CENTROID, stations, fresh, NOW).isStale).toBe(false);
  });

  it('W5 — the all-dry case observed on 1-3 Sep 2026 scores 0, and 0 is a measurement', () => {
    const readings = RainfallFeedParser.parseReadings(payload([{ minutesAgo: 5, values: { S111: 0, S222: 0, S333: 0 } }]));
    const rain = accumulator.accumulate(CENTROID, stations, readings, NOW);
    expect(rain.accum24hMm).toBe(0);
    expect(rain.isStale).toBe(false);
  });
});

class FakeRainSource implements RainfallSource {
  constructor(private readonly body: RawRainfallPayload) {}

  sourceKind(): SourceKind {
    return SourceKind.Rainfall;
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async fetchStations(): Promise<RawPayload> {
    return this.fetchReadings();
  }

  async fetchReadings(): Promise<RawPayload> {
    return { retrievedAt: NOW, body: this.body };
  }
}

describe('The rainfall ingestion job', () => {
  it('J1 — stores stations and fresh readings, and reports what 1.2.4 discarded', async () => {
    const store = new InMemoryRainfallStore();
    const job = new RainfallIngestionJob(
      new FakeRainSource(payload([{ minutesAgo: 5, values: { S111: 1 } }, { minutesAgo: 90, values: { S111: 9 } }])),
      new InMemoryIngestionRunStore(),
      store,
    );

    const run = await job.run();

    expect(run.featureCount).toBe(1);
    expect(job.discarded).toBe(1);
    expect((await store.stations()).length).toBe(4);
  });

  it('J2 — an overlapping backfill page cannot double-count a reading into the accumulation', async () => {
    const store = new InMemoryRainfallStore();
    const job = new RainfallIngestionJob(new FakeRainSource(payload([])), new InMemoryIngestionRunStore(), store);
    const page = { retrievedAt: NOW, body: payload([{ minutesAgo: 5, values: { S111: 2, S222: 2 } }]) };

    const first = await job.backfill([page]);
    const second = await job.backfill([page]);

    expect(first).toBe(2);
    expect(second).toBe(0);
    expect(store.size()).toBe(2);
  });

  it('J3 — the API date is a Singapore calendar date, not a UTC one', () => {
    // 16:00 UTC is already the next day in Singapore. Deriving the date from a UTC clock is off by
    // one for eight hours out of every twenty-four, which would silently backfill the wrong day.
    expect(RainfallGateway.singaporeDate(new Date('2026-09-03T16:30:00Z'))).toBe('2026-09-04');
    expect(RainfallGateway.singaporeDate(new Date('2026-09-03T02:00:00Z'))).toBe('2026-09-03');
  });
});

describe('HTTP rate limiting (10.4.6)', () => {
  it('H1 — Retry-After in seconds is honoured, and capped so one header cannot stall a cycle', () => {
    const res = new Response(null, { status: 429, headers: { 'retry-after': '5' } });
    expect(HttpClient.retryAfterMs(res)).toBe(5000);

    const absurd = new Response(null, { status: 429, headers: { 'retry-after': '86400' } });
    expect(HttpClient.retryAfterMs(absurd)).toBe(60_000);
  });

  it('H2 — no Retry-After falls back to exponential backoff, not to zero', () => {
    expect(HttpClient.retryAfterMs(new Response(null, { status: 429 }))).toBeNull();
  });
});
