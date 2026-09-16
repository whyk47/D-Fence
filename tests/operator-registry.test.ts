/**
 * D-Fence — Lab 4 §6.6: the vector control operator registry, requirement group 1.6.
 *
 * Cases G1–G6, designed in `lab4/TEST-PLAN.md` before the code existed and executed here.
 *
 * The registry is static reference data presented beside live feeds, and G6 is in this file for
 * that reason alone: 1.6.7 is a display obligation, it is testable, so it is tested.
 */
import { describe, expect, it } from 'vitest';
import { VCORegistryGateway } from '../src/boundary/gateways/VCORegistryGateway';
import { OperatorRegistryLoader } from '../src/control/OperatorRegistryLoader';
import { InMemoryOperatorRegistryStore } from '../src/persistence/memory/InMemoryPestReferenceStores';
import { GeocodeCandidate, GeocodingSource, OperatorRegistrySource } from '../src/ports/ExternalGateway';
import { GeoPoint } from '../src/entity/valueTypes';
import { SourceKind } from '../src/entity/enums';
import { RawPayload } from '../src/ports/types';
import { VectorControlOperator } from '../src/entity/VectorControlOperator';

const HEADER = 'company_name,block_house_number,street_name,postal_code,tel_no';

/** The publication date the dataset actually carried when it was verified. 1.6.7's subject. */
const PUBLISHED = new Date('2024-06-06T00:00:00Z');

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

class FakeRegistrySource implements OperatorRegistrySource {
  calls = 0;
  constructor(
    private readonly body: string,
    private readonly failing = false,
  ) {}
  sourceKind(): SourceKind {
    return SourceKind.OperatorRegistry;
  }
  async isHealthy(): Promise<boolean> {
    return !this.failing;
  }
  async fetchRegistry(): Promise<RawPayload> {
    this.calls += 1;
    if (this.failing) {
      throw new Error('registry unavailable');
    }
    return { retrievedAt: new Date(), body: this.body };
  }
  async fetchPublishedAt(): Promise<Date | null> {
    return PUBLISHED;
  }
}

class FakeGeocoder implements GeocodingSource {
  searched: string[] = [];
  constructor(
    private readonly answers: Record<string, GeoPoint>,
    private readonly failing = false,
  ) {}
  sourceKind(): SourceKind {
    return SourceKind.Geocoding;
  }
  async isHealthy(): Promise<boolean> {
    return !this.failing;
  }
  async requestToken(): Promise<void> {}
  async search(address: string): Promise<GeocodeCandidate[]> {
    this.searched.push(address);
    if (this.failing) {
      throw new Error('geocoder unavailable');
    }
    const point = this.answers[address];
    return point === undefined ? [] : [{ point, address, postalCode: address }];
  }
}

describe('EC: the registry CSV parses to operators (1.6.2, 1.6.3)', () => {
  it('G1 — a six-digit postal code is accepted and a two-digit one is rejected', () => {
    const operators = VCORegistryGateway.parse(
      csv('SECTOR ONLY PTE LTD,1,Anson Road,52,61234567', 'REAL PTE LTD,2,Anson Road,528844,67654321'),
    );

    expect(operators).toHaveLength(1);
    expect(operators[0]?.postalCode).toBe('528844');
    // The reason the rule exists: a four-digit sector geocodes to the centre of a whole district,
    // which would place an operator kilometres from where it is and quietly improve the
    // response-capacity number for every locality near that centre.
    expect(operators.map((o) => o.companyName)).not.toContain('SECTOR ONLY PTE LTD');
  });

  it('G1b — a quoted company name containing a comma does not shear the later columns', () => {
    // Not in the designed set. It is here because `split(",")` passes G1 and fails this, and the
    // symptom would not look like a parsing bug: it would look like 290 rows with bad postal codes.
    const operators = VCORegistryGateway.parse(
      csv('"PEST-PRO MANAGEMENT PTE. LTD., SINGAPORE",10,Bukit Batok Crescent,658079,68881234'),
    );

    expect(operators).toHaveLength(1);
    expect(operators[0]?.companyName).toBe('PEST-PRO MANAGEMENT PTE. LTD., SINGAPORE');
    expect(operators[0]?.postalCode).toBe('658079');
    expect(operators[0]?.telephoneNumber).toBe('68881234');
  });
});

describe('The operator registry loader (1.6.4-1.6.8)', () => {
  it('G2 — every valid row is loaded and geocoded', async () => {
    const source = new FakeRegistrySource(
      csv(
        'ALPHA PEST PTE LTD,1,Anson Road,528844,61111111',
        'BETA PEST PTE LTD,2,Toh Guan Road East,608599,62222222',
      ),
    );
    const geocoder = new FakeGeocoder({
      '528844': new GeoPoint(1.3414, 103.94327),
      '608599': new GeoPoint(1.3336, 103.7463),
    });
    const store = new InMemoryOperatorRegistryStore();

    const result = await new OperatorRegistryLoader(source, geocoder, store).load();

    expect(result.loaded).toBe(2);
    expect(result.ungeocoded).toBe(0);
    const registry = await store.registry();
    expect(registry.every((o) => o.location !== null)).toBe(true);
  });

  it('G3 — a postal code seen twice is geocoded once (1.6.5)', async () => {
    const source = new FakeRegistrySource(
      csv(
        'ALPHA PEST PTE LTD,#01-01,Anson Road,528844,61111111',
        'BETA PEST PTE LTD,#09-04,Anson Road,528844,62222222',
      ),
    );
    const geocoder = new FakeGeocoder({ '528844': new GeoPoint(1.3414, 103.94327) });
    const store = new InMemoryOperatorRegistryStore();

    const result = await new OperatorRegistryLoader(source, geocoder, store).load();

    // Two operators, one building. Keying the cache by address rather than postal code would have
    // resolved this twice, and 290 operators share far fewer than 290 postal codes.
    expect(geocoder.searched).toEqual(['528844']);
    expect(result.cacheHits).toBe(1);
    expect(result.loaded).toBe(2);
  });

  it('G4 — a failed load retains the previously stored registry (1.6.6)', async () => {
    const store = new InMemoryOperatorRegistryStore();
    const geocoder = new FakeGeocoder({ '528844': new GeoPoint(1.3414, 103.94327) });
    const good = new FakeRegistrySource(csv('ALPHA PEST PTE LTD,1,Anson Road,528844,61111111'));
    await new OperatorRegistryLoader(good, geocoder, store).load();

    const broken = new FakeRegistrySource('', true);
    const result = await new OperatorRegistryLoader(broken, geocoder, store).load();

    expect(result.retainedPrevious).toBe(true);
    // "The store is emptier than it was" is the one outcome 1.6.6 forbids, and it is what a loader
    // that wrote as it went would produce.
    expect(await store.registry()).toHaveLength(1);
    expect(await store.publishedAt()).toEqual(PUBLISHED);
  });

  it('G4b — one address the geocoder cannot resolve does not fail the load', async () => {
    const source = new FakeRegistrySource(
      csv(
        'ALPHA PEST PTE LTD,1,Anson Road,528844,61111111',
        'GHOST PEST PTE LTD,2,Nowhere Road,999999,62222222',
      ),
    );
    const geocoder = new FakeGeocoder({ '528844': new GeoPoint(1.3414, 103.94327) });
    const store = new InMemoryOperatorRegistryStore();

    const result = await new OperatorRegistryLoader(source, geocoder, store).load();

    // One unresolvable row is not the registry failing to load. The row is kept without a
    // coordinate — its name and telephone are still useful — and 1.6.8 skips it.
    expect(result.retainedPrevious).toBe(false);
    expect(result.loaded).toBe(1);
    expect(result.ungeocoded).toBe(1);
    expect(await store.registry()).toHaveLength(2);
  });

  it('G5 — the nearest operator distance is the straight-line distance (1.6.8)', () => {
    const near = new VectorControlOperator('NEAR', '1', 'Anson Road', '528844', '6', new GeoPoint(1.35, 103.8));
    const far = new VectorControlOperator('FAR', '2', 'Anson Road', '608599', '6', new GeoPoint(1.45, 103.8));
    const from = new GeoPoint(1.34, 103.8);

    const metres = OperatorRegistryLoader.nearestOperatorMetres(from, [far, near]);

    // 0.01 degrees of latitude is about 1112 m. Asserting the value, not merely which operator was
    // chosen, is what makes this a test of 1.6.8 rather than a test of Array.sort.
    expect(metres).not.toBeNull();
    expect(Math.round(metres as number)).toBe(1112);
  });

  it('G5b — no operator has a coordinate, so the distance is unknown rather than capped', () => {
    const ungeocoded = new VectorControlOperator('GHOST', '1', 'Nowhere', '999999', '6', null);

    // Null, not the 8 km cap. 4.1.9 excludes a driver whose value is unknown and renormalises the
    // rest; handing it the cap instead would score "we have no registry" identically to "the
    // nearest operator is 8 km away", and those are not the same claim.
    expect(OperatorRegistryLoader.nearestOperatorMetres(new GeoPoint(1.34, 103.8), [ungeocoded])).toBeNull();
  });

  it('G6 — the registry is stored with its source publication date (1.6.7)', async () => {
    const source = new FakeRegistrySource(csv('ALPHA PEST PTE LTD,1,Anson Road,528844,61111111'));
    const geocoder = new FakeGeocoder({ '528844': new GeoPoint(1.3414, 103.94327) });
    const store = new InMemoryOperatorRegistryStore();

    await new OperatorRegistryLoader(source, geocoder, store).load();

    // Not cosmetic. This file was published in 2024 and sits beside live NEA data; the one thing a
    // viewer must not conclude is that 290 offices were where they are today. The date travels on
    // every operator as well as on the store, so a new screen cannot forget to fetch it.
    expect(await store.publishedAt()).toEqual(PUBLISHED);
    expect((await store.registry())[0]?.publishedAt).toEqual(PUBLISHED);
  });
});
