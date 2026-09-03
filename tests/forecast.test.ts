/**
 * D-Fence — Lab 4 §3.2: the 24-hour forecast, its region mapping and the heavy-rain flag (US-1.4).
 *
 * This suite exists for a specific reason. Until this story, `Cluster.heavyRainExpected` was
 * written by nothing at all: driver 4.1.4 read `false` for every cluster in the country and the
 * heavy-rain alert of 6.1.5 could not fire. Two features looked implemented, passed their own
 * tests, and were fed a constant. So the cases here are weighted towards the **join** — forecast to
 * region to cluster — rather than towards the parsing, which is the easy half.
 *
 * Design: equivalence classes on the keyword rule (1.3.3), boundary values on the four region cut
 * lines (1.3.2), and a partition property that holds for every point in Singapore's box rather than
 * for the handful of towns the boxes were drawn against.
 */
import { describe, expect, it } from 'vitest';
import { ForecastRegionMap } from '../src/control/ingestion/ForecastRegionMap';
import { ForecastFeedParser, RawForecastPayload } from '../src/control/ingestion/ForecastFeedParser';
import { ForecastIngestionJob } from '../src/control/ingestion/ForecastIngestionJob';
import { ForecastGateway } from '../src/boundary/gateways/ForecastGateway';
import { HttpClient, RequestOptions } from '../src/boundary/gateways/HttpClient';
import {
  InMemoryClusterStore,
  InMemoryForecastStore,
  InMemoryIngestionRunStore,
} from '../src/persistence/memory/InMemoryStores';
import { Cluster } from '../src/entity/Cluster';
import { GeoPoint, Polygon, PremisesMix } from '../src/entity/valueTypes';
import { ChangeClass, ForecastRegion, SourceKind } from '../src/entity/enums';
import { ForecastSource } from '../src/ports/ExternalGateway';
import { RawPayload } from '../src/ports/types';

/** Real places, so that moving a cut line has to be argued for against somewhere that exists. */
const TOWNS: Array<[string, number, number, ForecastRegion]> = [
  ['Woodlands', 1.437, 103.786, ForecastRegion.north],
  ['Yishun', 1.429, 103.835, ForecastRegion.north],
  ['Sembawang', 1.4491, 103.82, ForecastRegion.north],
  ['Bukit Merah', 1.2819, 103.8239, ForecastRegion.south],
  ['Sentosa', 1.2494, 103.8303, ForecastRegion.south],
  ['Marina Bay', 1.283, 103.86, ForecastRegion.south],
  ['Clementi', 1.315, 103.765, ForecastRegion.west],
  ['Tuas', 1.32, 103.63, ForecastRegion.west],
  ['Jurong West', 1.34, 103.707, ForecastRegion.west],
  ['Bedok', 1.324, 103.93, ForecastRegion.east],
  ['Tampines', 1.353, 103.945, ForecastRegion.east],
  ['Changi', 1.357, 103.988, ForecastRegion.east],
  ['Bishan', 1.351, 103.848, ForecastRegion.central],
  ['Toa Payoh', 1.334, 103.849, ForecastRegion.central],
  ['Bukit Timah', 1.354, 103.776, ForecastRegion.central],
];

/** The live shape, verified 2026-09-03. Trimmed to what the parser reads. */
function livePayload(): RawForecastPayload {
  return {
    code: 0,
    errorMsg: '',
    data: {
      records: [
        {
          date: '2026-09-03',
          updatedTimestamp: '2026-09-03T17:00:00+08:00',
          timestamp: '2026-09-03T17:00:00+08:00',
          general: {
            validPeriod: {
              text: '6 pm to 6 pm',
              start: '2026-09-03T18:00:00+08:00',
              end: '2026-09-04T18:00:00+08:00',
            },
          },
          periods: [
            {
              timePeriod: {
                text: 'Evening',
                start: '2026-09-03T18:00:00+08:00',
                end: '2026-09-04T06:00:00+08:00',
              },
              regions: {
                north: { code: 'PC', text: 'Partly Cloudy (Night)' },
                south: { code: 'PC', text: 'Partly Cloudy (Night)' },
                east: { code: 'PC', text: 'Partly Cloudy (Night)' },
                west: { code: 'TL', text: 'Thundery Showers' },
                central: { code: 'PC', text: 'Partly Cloudy (Night)' },
              },
            },
            {
              timePeriod: {
                text: 'Morning',
                start: '2026-09-04T06:00:00+08:00',
                end: '2026-09-04T12:00:00+08:00',
              },
              regions: {
                north: { code: 'CL', text: 'Cloudy' },
                south: { code: 'CL', text: 'Cloudy' },
                east: { code: 'CL', text: 'Cloudy' },
                west: { code: 'CL', text: 'Cloudy' },
                central: { code: 'CL', text: 'Cloudy' },
              },
            },
            {
              timePeriod: {
                text: 'Afternoon',
                start: '2026-09-04T12:00:00+08:00',
                end: '2026-09-04T18:00:00+08:00',
              },
              regions: {
                north: { code: 'SH', text: 'Showers' },
                south: { code: 'FA', text: 'Fair (Day)' },
                east: { code: 'FA', text: 'Fair (Day)' },
                west: { code: 'FA', text: 'Fair (Day)' },
                central: { code: 'FA', text: 'Fair (Day)' },
              },
            },
          ],
        },
      ],
    },
  };
}

function clusterAt(objectId: string, lat: number, lon: number): Cluster {
  const cluster = new Cluster();
  cluster.objectId = objectId;
  cluster.locality = objectId;
  cluster.caseSize = 5;
  cluster.caseDelta = 0;
  cluster.changeClass = ChangeClass.UNCHANGED;
  cluster.isActive = true;
  cluster.heavyRainExpected = false;
  cluster.premisesMix = new PremisesMix();
  // A small square around the point; the centroid of the outer ring is the point itself.
  const d = 0.001;
  cluster.boundary = new Polygon([
    [
      new GeoPoint(lat - d, lon - d),
      new GeoPoint(lat - d, lon + d),
      new GeoPoint(lat + d, lon + d),
      new GeoPoint(lat + d, lon - d),
    ],
  ]);
  return cluster;
}

class FakeForecastSource implements ForecastSource {
  constructor(private readonly body: RawForecastPayload | Error) {}

  sourceKind(): SourceKind {
    return SourceKind.Forecast;
  }

  async isHealthy(): Promise<boolean> {
    return !(this.body instanceof Error);
  }

  async fetch24hForecast(): Promise<RawPayload> {
    if (this.body instanceof Error) {
      throw this.body;
    }
    return { retrievedAt: new Date('2026-09-03T17:05:00+08:00'), body: this.body };
  }
}

async function seeded(clusters: Cluster[]): Promise<InMemoryClusterStore> {
  const store = new InMemoryClusterStore();
  await store.upsertFromFeed({ retrievedAt: new Date('2026-09-03T17:00:00+08:00'), records: clusters });
  return store;
}

describe('1.3.2 — mapping a cluster centroid to exactly one forecast region', () => {
  it('M1 — fifteen real places land in the region a Singaporean would name', () => {
    for (const [name, lat, lon, expected] of TOWNS) {
      expect(`${name}:${ForecastRegionMap.assign(new GeoPoint(lat, lon))}`).toBe(`${name}:${expected}`);
    }
  });

  it('M2 — the four cut lines are boundary-tested from both sides', () => {
    // Latitude 1.29, the south/central line: the value itself belongs to the northern side.
    expect(ForecastRegionMap.containing(new GeoPoint(1.29, 103.82))).toBe(ForecastRegion.central);
    expect(ForecastRegionMap.containing(new GeoPoint(1.2899999, 103.82))).toBe(ForecastRegion.south);
    // Latitude 1.39, the central/north line.
    expect(ForecastRegionMap.containing(new GeoPoint(1.39, 103.82))).toBe(ForecastRegion.north);
    expect(ForecastRegionMap.containing(new GeoPoint(1.3899999, 103.82))).toBe(ForecastRegion.central);
    // Longitude 103.77, the west/central line, and 103.89, the central/east line. Central owns
    // both of its own edges, which is why one test is >= and the other <=.
    expect(ForecastRegionMap.containing(new GeoPoint(1.34, 103.77))).toBe(ForecastRegion.central);
    expect(ForecastRegionMap.containing(new GeoPoint(1.34, 103.7699999))).toBe(ForecastRegion.west);
    expect(ForecastRegionMap.containing(new GeoPoint(1.34, 103.89))).toBe(ForecastRegion.central);
    expect(ForecastRegionMap.containing(new GeoPoint(1.34, 103.8900001))).toBe(ForecastRegion.east);
  });

  it('M3 — a point outside every region box takes the nearest-region fallback, never null', () => {
    // Johor Bahru, well north of the box, and a point in the Singapore Strait well south of it.
    const johor = new GeoPoint(1.6, 103.75);
    const strait = new GeoPoint(1.05, 103.85);
    expect(ForecastRegionMap.containing(johor)).toBeNull();
    expect(ForecastRegionMap.containing(strait)).toBeNull();
    // The fallback matters: a cluster with no region is one the heavy-rain driver skips, which
    // reads downstream as "no rain expected" rather than as "not known".
    expect(ForecastRegionMap.assign(johor)).toBe(ForecastRegion.north);
    expect(ForecastRegionMap.assign(strait)).toBe(ForecastRegion.south);
  });

  it('M4 — the five boxes partition the bounds: every point inside gets a region', () => {
    // The property 1.3.2 actually states, checked over a grid rather than over the towns the
    // lines were drawn against — those would pass a map with a hole in the middle of it.
    const b = ForecastRegionMap.BOUNDS;
    let checked = 0;
    for (let lat = b.minLat; lat <= b.maxLat; lat += 0.005) {
      for (let lon = b.minLon; lon <= b.maxLon; lon += 0.005) {
        expect(ForecastRegionMap.containing(new GeoPoint(lat, lon))).not.toBeNull();
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(6_000);
  });

  it('M5 — the region rectangles are available as closed polygons for the map layer', () => {
    const polygons = ForecastRegionMap.polygons();
    expect(polygons).toHaveLength(5);
    for (const { polygon } of polygons) {
      const ring = polygon.rings[0] as GeoPoint[];
      expect(ring).toHaveLength(5);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
    }
  });
});

describe('1.3.3 — the heavy-rain keyword rule', () => {
  it('K1 — each of the three named keywords sets the flag', () => {
    expect(ForecastFeedParser.impliesHeavyRain('Heavy Thundery Showers')).toBe(true);
    expect(ForecastFeedParser.impliesHeavyRain('Thundery Showers')).toBe(true);
    expect(ForecastFeedParser.impliesHeavyRain('Showers')).toBe(true);
    expect(ForecastFeedParser.impliesHeavyRain('Late Morning and Afternoon Thundery Showers')).toBe(true);
  });

  it('K2 — the dry equivalence class does not', () => {
    for (const text of ['Fair (Day)', 'Partly Cloudy (Night)', 'Cloudy', 'Hazy', 'Windy']) {
      expect(ForecastFeedParser.impliesHeavyRain(text)).toBe(false);
    }
  });

  it('K3 — the rule is case-insensitive, because 1.3.3 names words and not capitalisation', () => {
    expect(ForecastFeedParser.impliesHeavyRain('heavy rain')).toBe(true);
    expect(ForecastFeedParser.impliesHeavyRain('SHOWERS')).toBe(true);
  });

  it('K4 — "Light Rain" is the near-miss: it is rain, and 1.3.3 still says no', () => {
    // Stated as a case rather than left implicit: it is the first thing a reader will challenge,
    // and the answer is that the requirement lists three words and this is not one of them.
    expect(ForecastFeedParser.impliesHeavyRain('Light Rain')).toBe(false);
  });
});

describe('1.3.1, 1.3.4 — parsing the payload', () => {
  const retrievedAt = new Date('2026-09-03T17:05:00+08:00');

  it('F1 — the live shape yields one forecast per macro-region', () => {
    const forecasts = ForecastFeedParser.parse(livePayload(), retrievedAt);
    expect(forecasts).toHaveLength(5);
    expect(forecasts.map((f) => f.region).sort()).toEqual([...Object.values(ForecastRegion)].sort());
  });

  it('F2 — the three periods are folded with OR, so rain in any period is rain expected', () => {
    const by = new Map(ForecastFeedParser.parse(livePayload(), retrievedAt).map((f) => [f.region, f]));
    // West: thundery showers in the evening only. North: showers in the afternoon only.
    expect(by.get(ForecastRegion.west)?.heavyRainExpected).toBe(true);
    expect(by.get(ForecastRegion.north)?.heavyRainExpected).toBe(true);
    // South, east and central are dry in all three periods.
    expect(by.get(ForecastRegion.south)?.heavyRainExpected).toBe(false);
    expect(by.get(ForecastRegion.east)?.heavyRainExpected).toBe(false);
    expect(by.get(ForecastRegion.central)?.heavyRainExpected).toBe(false);
  });

  it('F3 — 1.3.5: the text kept is the basis, period labels included', () => {
    const west = ForecastFeedParser.parse(livePayload(), retrievedAt).find(
      (f) => f.region === ForecastRegion.west,
    );
    expect(west?.forecastText).toContain('Evening: Thundery Showers');
    expect(west?.forecastText).toContain('Morning: Cloudy');
  });

  it('F4 — 1.3.4: validity spans the earliest period start to the latest period end', () => {
    const forecast = ForecastFeedParser.parse(livePayload(), retrievedAt)[0];
    expect(forecast?.validFrom.toISOString()).toBe(new Date('2026-09-03T18:00:00+08:00').toISOString());
    expect(forecast?.validTo.toISOString()).toBe(new Date('2026-09-04T18:00:00+08:00').toISOString());
    expect(forecast?.covers(new Date('2026-09-04T09:00:00+08:00'))).toBe(true);
    expect(forecast?.covers(new Date('2026-09-04T19:00:00+08:00'))).toBe(false);
  });

  it('F5 — when the periods carry no timestamps, general.validPeriod is used instead', () => {
    const payload = livePayload();
    for (const period of payload.data?.records?.[0]?.periods ?? []) {
      period.timePeriod = { text: 'Evening' };
    }
    const forecast = ForecastFeedParser.parse(payload, retrievedAt)[0];
    expect(forecast?.validFrom.toISOString()).toBe(new Date('2026-09-03T18:00:00+08:00').toISOString());
  });

  it('F6 — with no validity anywhere, the window is 24 hours from retrieval, not forever', () => {
    const payload = livePayload();
    const record = payload.data?.records?.[0];
    if (record !== undefined) {
      record.general = {};
      for (const period of record.periods ?? []) {
        period.timePeriod = { text: 'Evening' };
      }
    }
    const forecast = ForecastFeedParser.parse(payload, retrievedAt)[0];
    expect(forecast?.validFrom.getTime()).toBe(retrievedAt.getTime());
    expect((forecast as { validTo: Date }).validTo.getTime() - retrievedAt.getTime()).toBe(24 * 3_600_000);
  });

  it('F7 — a region absent from every period is omitted, not defaulted to dry', () => {
    const payload = livePayload();
    for (const period of payload.data?.records?.[0]?.periods ?? []) {
      delete period.regions?.east;
    }
    const forecasts = ForecastFeedParser.parse(payload, retrievedAt);
    expect(forecasts).toHaveLength(4);
    expect(forecasts.some((f) => f.region === ForecastRegion.east)).toBe(false);
  });

  it('F8 — an empty payload throws rather than producing five empty forecasts (10.2.4)', () => {
    expect(() => ForecastFeedParser.parse({ code: 1, errorMsg: 'boom' }, retrievedAt)).toThrow(/no records/);
    expect(() => ForecastFeedParser.parse({ data: { records: [{ periods: [] }] } }, retrievedAt)).toThrow(
      /no periods/,
    );
  });
});

describe('The forecast ingestion job — the join that 4.1.4 and 6.1.5 were missing', () => {
  it('J1 — every active cluster comes out with a region, a flag and a validity window', async () => {
    const clusters = await seeded([
      clusterAt('west-1', 1.34, 103.707), // Jurong West — thundery showers in the evening
      clusterAt('east-1', 1.324, 103.93), // Bedok — dry in all three periods
      clusterAt('north-1', 1.437, 103.786), // Woodlands — afternoon showers
    ]);
    const job = new ForecastIngestionJob(
      new FakeForecastSource(livePayload()),
      new InMemoryIngestionRunStore(),
      new InMemoryForecastStore(),
      clusters,
    );

    const run = await job.run('MANUAL');
    expect(run.outcome).toBe('SUCCESS');

    const byObjectId = new Map((await clusters.findActive()).map((c) => [c.objectId, c]));
    expect(byObjectId.get('west-1')?.forecastRegion).toBe(ForecastRegion.west);
    expect(byObjectId.get('west-1')?.heavyRainExpected).toBe(true);
    expect(byObjectId.get('north-1')?.heavyRainExpected).toBe(true);
    expect(byObjectId.get('east-1')?.heavyRainExpected).toBe(false);
    // 1.3.4 — the window travels with the derived value, on the cluster, not only on the forecast.
    expect(byObjectId.get('west-1')?.forecastValidFrom?.toISOString()).toBe(
      new Date('2026-09-03T18:00:00+08:00').toISOString(),
    );
    expect(byObjectId.get('west-1')?.forecastValidTo?.toISOString()).toBe(
      new Date('2026-09-04T18:00:00+08:00').toISOString(),
    );
  });

  it('J2 — the feature count is clusters flagged, not forecasts stored', async () => {
    // Five rows nobody joined would look like a successful run while the driver stayed constant,
    // which is exactly how this gap survived until now.
    const clusters = await seeded([clusterAt('a', 1.34, 103.71), clusterAt('b', 1.32, 103.93)]);
    const store = new InMemoryForecastStore();
    const run = await new ForecastIngestionJob(
      new FakeForecastSource(livePayload()),
      new InMemoryIngestionRunStore(),
      store,
      clusters,
    ).run('MANUAL');
    expect(run.featureCount).toBe(2);
    expect(await store.latest()).toHaveLength(5);
  });

  it('J3 — 1.3.5: the forecast the flag came from is stored and retrievable per region', async () => {
    const store = new InMemoryForecastStore();
    await new ForecastIngestionJob(
      new FakeForecastSource(livePayload()),
      new InMemoryIngestionRunStore(),
      store,
      await seeded([clusterAt('a', 1.34, 103.71)]),
    ).run('MANUAL');
    const west = await store.latestFor(ForecastRegion.west);
    expect(west?.forecastText).toContain('Thundery Showers');
    expect(west?.heavyRainExpected).toBe(true);
  });

  it('J4 — a region missing from the payload leaves its clusters untouched, not cleared (10.2.2)', async () => {
    const clusters = await seeded([clusterAt('east-1', 1.324, 103.93)]);
    const runs = new InMemoryIngestionRunStore();
    const store = new InMemoryForecastStore();

    // First cycle: east is wet, and the flag is set.
    const wet = livePayload();
    for (const period of wet.data?.records?.[0]?.periods ?? []) {
      if (period.regions?.east !== undefined) {
        period.regions.east = { code: 'TL', text: 'Thundery Showers' };
      }
    }
    await new ForecastIngestionJob(new FakeForecastSource(wet), runs, store, clusters).run('MANUAL');
    expect((await clusters.findActive())[0]?.heavyRainExpected).toBe(true);

    // Second cycle: the payload simply omits east. Silently clearing the flag would turn a partial
    // payload into a confident all-clear, which is the wrong direction of failure for a warning.
    const partial = livePayload();
    for (const period of partial.data?.records?.[0]?.periods ?? []) {
      delete period.regions?.east;
    }
    const second = await new ForecastIngestionJob(
      new FakeForecastSource(partial),
      runs,
      store,
      clusters,
    ).run('MANUAL');
    expect(second.featureCount).toBe(0);
    expect((await clusters.findActive())[0]?.heavyRainExpected).toBe(true);
  });

  it('J5 — a failed fetch marks the source stale and changes no stored flag (10.2.4)', async () => {
    const clusters = await seeded([clusterAt('west-1', 1.34, 103.707)]);
    const runs = new InMemoryIngestionRunStore();
    const store = new InMemoryForecastStore();
    await new ForecastIngestionJob(new FakeForecastSource(livePayload()), runs, store, clusters).run('MANUAL');
    expect((await clusters.findActive())[0]?.heavyRainExpected).toBe(true);

    const failed = await new ForecastIngestionJob(
      new FakeForecastSource(new Error('upstream 503')),
      runs,
      store,
      clusters,
    ).run('MANUAL');
    expect(failed.outcome).toBe('FAILED');
    expect((await clusters.findActive())[0]?.heavyRainExpected).toBe(true);
    expect(await store.latest()).toHaveLength(5);
  });

  it('J6 — a cluster outside every region box is flagged by the fallback and reported', async () => {
    // A point in the strait, south of the bounding box. The job must still produce an answer for
    // it and must say that it had to reach for the fallback to do so.
    const clusters = await seeded([clusterAt('strait-1', 1.05, 103.85)]);
    const job = new ForecastIngestionJob(
      new FakeForecastSource(livePayload()),
      new InMemoryIngestionRunStore(),
      new InMemoryForecastStore(),
      clusters,
    );
    await job.run('MANUAL');
    expect(job.outsideEveryRegion).toEqual(['strait-1']);
    expect((await clusters.findActive())[0]?.forecastRegion).toBe(ForecastRegion.south);
  });
});

describe('The gateway — 1.4.x health', () => {
  class StubHttp extends HttpClient {
    constructor(private readonly body: unknown) {
      super();
    }

    override async getJson<T>(_url: string, _opts: RequestOptions = {}): Promise<T> {
      if (this.body instanceof Error) {
        throw this.body;
      }
      return this.body as T;
    }
  }

  it('G1 — a payload with records is healthy', async () => {
    const gateway = new ForecastGateway(new StubHttp(livePayload()));
    expect(gateway.sourceKind()).toBe(SourceKind.Forecast);
    expect(await gateway.isHealthy()).toBe(true);
  });

  it('G2 — a 200 carrying an error body is NOT healthy', async () => {
    // The whole point of asking the parser rather than the status code: data.gov.sg answers 200
    // with `code: 1` and an errorMsg, which a status-code check would report as a healthy source.
    const gateway = new ForecastGateway(new StubHttp({ code: 1, errorMsg: 'no data', data: { records: [] } }));
    expect(await gateway.isHealthy()).toBe(false);
  });

  it('G3 — a transport failure is unhealthy rather than an exception out of isHealthy', async () => {
    const gateway = new ForecastGateway(new StubHttp(new Error('ECONNREFUSED')));
    expect(await gateway.isHealthy()).toBe(false);
  });
});
