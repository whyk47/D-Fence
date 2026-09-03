/**
 * D-Fence — Lab 4 §3.2: saved locations, geocoding and exposure (§3).
 *
 * Two things carry this suite.
 *
 * **The 150 m band (3.1.9)** is a boundary value, and it is measured to a cluster *boundary*, not
 * to its centre. The cases below build a cluster of a known size and check 149, 150 and 151 metres
 * from its edge — which is only a meaningful test because the distance is computed the way the
 * requirement means it.
 *
 * **The two geocoding failures (3.1.13 vs 3.1.17)** must not be the same sentence. Telling a
 * resident their address does not exist because a token lapsed is the defect these cases exist to
 * prevent, and it is the easiest one in the whole system to write by accident.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { AccessControlService, NotAuthorised } from '../src/control/AccessControlService';
import { AccessPolicy } from '../src/control/AccessPolicy';
import {
  GeocodingController,
  AddressNotFound,
  GeocodingUnavailable,
  MAX_CANDIDATES,
} from '../src/control/GeocodingController';
import { SavedLocationController, LocationRejected } from '../src/control/SavedLocationController';
import { InMemoryClusterStore, InMemoryAuditStore } from '../src/persistence/memory/InMemoryStores';
import { InMemoryClusterLocator } from '../src/persistence/memory/InMemoryReportStores';
import {
  InMemoryAlertSubscriptionStore,
  InMemorySavedLocationStore,
} from '../src/persistence/memory/InMemoryLocationStores';
import { Cluster } from '../src/entity/Cluster';
import { SavedLocation, MAX_SAVED_LOCATIONS, NEAR_CLUSTER_METRES } from '../src/entity/SavedLocation';
import { GeoPoint, Polygon, PremisesMix } from '../src/entity/valueTypes';
import { GeocodeCandidate, GeocodingSource } from '../src/ports/ExternalGateway';
import { ExposureStatus, LocationLabel, Role, SourceKind } from '../src/entity/enums';
import { Principal } from '../src/control/Principal';

const RESIDENT = new Principal('resident-1', Role.Resident, 'session-r1');
const OTHER = new Principal('resident-2', Role.Resident, 'session-r2');
const CREW = new Principal('crew-1', Role.CleaningCrew, 'session-crew');

/**
 * A square cluster, 400 m on a side, centred on this point. Chosen so the edges are far enough
 * apart that a 150 m band outside the boundary is nowhere near the centre — which is the whole
 * distinction between boundary distance and centroid distance.
 */
const CENTRE = new GeoPoint(1.4300, 103.7900);
const HALF_SIDE_M = 200;
const M_PER_DEG_LAT = 111_320;

function offsetNorth(from: GeoPoint, metres: number): GeoPoint {
  return new GeoPoint(from.latitude + metres / M_PER_DEG_LAT, from.longitude);
}

/** A fake geocoder. Scripted per test, because §3's interesting cases are its failures. */
class FakeGeocoder implements GeocodingSource {
  results: GeocodeCandidate[] = [];
  failWith: Error | null = null;
  tokenRequests = 0;
  tokenFails = false;

  sourceKind(): SourceKind {
    return SourceKind.Geocoding;
  }

  async isHealthy(): Promise<boolean> {
    return this.failWith === null;
  }

  async search(_address: string): Promise<GeocodeCandidate[]> {
    if (this.failWith !== null) {
      throw this.failWith;
    }
    return this.results;
  }

  async requestToken(): Promise<void> {
    this.tokenRequests += 1;
    if (this.tokenFails) {
      throw new Error('OneMap token request failed: 401');
    }
  }
}

function candidate(point: GeoPoint, address = 'BLK 123 MARSILING RISE'): GeocodeCandidate {
  return { point, address, postalCode: '730123' };
}

interface Fixture {
  locations: SavedLocationController;
  geocoding: GeocodingController;
  geocoder: FakeGeocoder;
  store: InMemorySavedLocationStore;
  subscriptions: InMemoryAlertSubscriptionStore;
  clusterId: string;
}

async function fixture(): Promise<Fixture> {
  const clusters = new InMemoryClusterStore();
  const cluster = new Cluster();
  cluster.objectId = 'c-1';
  cluster.locality = 'Marsiling Rise';
  cluster.caseSize = 31;
  cluster.caseDelta = 4;
  cluster.isActive = true;
  cluster.premisesMix = new PremisesMix(['Bin'], [], []);
  const d = HALF_SIDE_M / M_PER_DEG_LAT;
  const dLon = HALF_SIDE_M / (M_PER_DEG_LAT * Math.cos((CENTRE.latitude * Math.PI) / 180));
  cluster.boundary = new Polygon([
    [
      new GeoPoint(CENTRE.latitude - d, CENTRE.longitude - dLon),
      new GeoPoint(CENTRE.latitude + d, CENTRE.longitude - dLon),
      new GeoPoint(CENTRE.latitude + d, CENTRE.longitude + dLon),
      new GeoPoint(CENTRE.latitude - d, CENTRE.longitude + dLon),
      new GeoPoint(CENTRE.latitude - d, CENTRE.longitude - dLon),
    ],
  ]);
  await clusters.upsertFromFeed({ retrievedAt: new Date('2026-09-03T10:06:00+08:00'), records: [cluster] });
  const stored = (await clusters.findActive())[0] as Cluster;

  const geocoder = new FakeGeocoder();
  const geocoding = new GeocodingController(geocoder);
  const store = new InMemorySavedLocationStore();
  const subscriptions = new InMemoryAlertSubscriptionStore();
  const ac = new AccessControlService(new AccessPolicy(), new InMemoryAuditStore());
  const locations = new SavedLocationController(
    ac,
    store,
    new InMemoryClusterLocator(clusters),
    geocoding,
    subscriptions,
  );
  return { locations, geocoding, geocoder, store, subscriptions, clusterId: stored.id };
}

/** Saves a location at `point`, bypassing the search step. */
async function save(f: Fixture, point: GeoPoint, by = RESIDENT, name = 'Home'): Promise<SavedLocation> {
  f.geocoder.results = [candidate(point)];
  return f.locations.addLocation(
    { candidate: candidate(point), label: LocationLabel.Home, name, inputText: '730123' },
    by,
  );
}

describe('Geocoding — §3.1.3, §3.1.4, §3.1.5, §3.1.13, §3.1.17', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('G1 — a match returns candidates carrying an address a person can recognise (3.1.3, 3.1.4)', async () => {
    f.geocoder.results = [candidate(CENTRE)];
    const found = await f.locations.search('730123', RESIDENT);
    // A bare coordinate pair cannot be confirmed by a resident, which is what 3.1.4 asks them to do.
    expect(found[0]?.address).toBe('BLK 123 MARSILING RISE');
  });

  it('G2 — at most five candidates are presented (3.1.4, boundary)', async () => {
    f.geocoder.results = Array.from({ length: 8 }, (_, i) => candidate(offsetNorth(CENTRE, i), `MATCH ${i}`));
    expect(await f.locations.search('blk 123', RESIDENT)).toHaveLength(MAX_CANDIDATES);
  });

  it('G3 — no result is "no match was found", not an error (3.1.5, 3.1.13)', async () => {
    f.geocoder.results = [];
    await expect(f.geocoding.geocode('nowhere at all')).rejects.toBeInstanceOf(AddressNotFound);
  });

  it('G4 — a failed lookup says "unavailable", NOT "no match found" (3.1.17)', async () => {
    f.geocoder.failWith = new Error('OneMap search failed: 500');
    const error = await f.geocoding.geocode('730123').catch((e: unknown) => e);
    // The distinction is the requirement: retyping fixes one of these and cannot fix the other.
    expect(error).toBeInstanceOf(GeocodingUnavailable);
    expect(error).not.toBeInstanceOf(AddressNotFound);
    expect((error as Error).message).toMatch(/temporarily unavailable/);
  });

  it('G5 — an authentication failure raises a source-health warning (3.1.16)', async () => {
    expect(f.geocoding.health().healthy).toBe(true);
    f.geocoder.failWith = new Error('OneMap search failed: 401');
    await f.geocoding.geocode('730123').catch(() => undefined);
    expect(f.geocoding.health()).toMatchObject({ source: SourceKind.Geocoding, healthy: false });
  });

  it('G6 — a successful token refresh clears the warning (3.1.14, 3.1.15, 3.1.16)', async () => {
    f.geocoder.failWith = new Error('401 unauthorized');
    await f.geocoding.geocode('730123').catch(() => undefined);
    expect(f.geocoding.health().healthy).toBe(false);

    f.geocoder.failWith = null;
    await f.geocoding.refreshToken();
    expect(f.geocoder.tokenRequests).toBe(1);
    expect(f.geocoding.health().healthy).toBe(true);
  });

  it('G7 — a failed refresh leaves the warning standing and reports unavailable (3.1.16, 3.1.17)', async () => {
    f.geocoder.tokenFails = true;
    await expect(f.geocoding.refreshToken()).rejects.toBeInstanceOf(GeocodingUnavailable);
    expect(f.geocoding.health().healthy).toBe(false);
  });
});

describe('Saving locations — §3.1.1, §3.1.6, §3.1.7, §3.1.11, §3.1.12', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('L1 — a saved location keeps what was typed and what was chosen (3.1.2, 3.1.4)', async () => {
    const location = await save(f, CENTRE);
    expect(location.inputText).toBe('730123');
    expect(location.resolvedAddress).toBe('BLK 123 MARSILING RISE');
  });

  it('L2 — five locations are allowed and a sixth is refused (3.1.1, boundary)', async () => {
    for (let i = 0; i < MAX_SAVED_LOCATIONS; i += 1) {
      await save(f, offsetNorth(CENTRE, i * 10), RESIDENT, `Place ${i}`);
    }
    await expect(save(f, CENTRE, RESIDENT, 'One too many')).rejects.toThrow(/already have 5/);
  });

  it('L3 — the limit is per resident, not global (3.1.1, 2.3.1)', async () => {
    for (let i = 0; i < MAX_SAVED_LOCATIONS; i += 1) {
      await save(f, offsetNorth(CENTRE, i * 10), RESIDENT, `Place ${i}`);
    }
    await expect(save(f, CENTRE, OTHER, 'Their home')).resolves.toBeInstanceOf(SavedLocation);
  });

  it('L4 — a label outside the four is refused (3.1.6)', async () => {
    await expect(
      f.locations.addLocation(
        { candidate: candidate(CENTRE), label: 'Gym' as LocationLabel, inputText: 'x' },
        RESIDENT,
      ),
    ).rejects.toBeInstanceOf(LocationRejected);
  });

  it('L5 — a 40-character name is accepted, 41 is refused (3.1.7, boundary)', async () => {
    await expect(save(f, CENTRE, RESIDENT, 'x'.repeat(40))).resolves.toBeInstanceOf(SavedLocation);
    await expect(save(f, CENTRE, RESIDENT, 'x'.repeat(41))).rejects.toThrow(/at most 40 characters/);
  });

  it('L6 — an omitted name falls back to the label rather than an empty card title (3.1.7)', async () => {
    const location = await f.locations.addLocation(
      { candidate: candidate(CENTRE), label: LocationLabel.Workplace, inputText: 'x' },
      RESIDENT,
    );
    expect(location.name).toBe(LocationLabel.Workplace);
  });

  it('L7 — a resident sees only their own locations (2.3.1)', async () => {
    await save(f, CENTRE, RESIDENT);
    await save(f, CENTRE, OTHER);
    expect(await f.locations.listLocations(RESIDENT)).toHaveLength(1);
  });

  it('L8 — a crew member has no saved locations at all (2.3.3, 2.3.5)', async () => {
    await expect(f.locations.listLocations(CREW)).rejects.toBeInstanceOf(NotAuthorised);
  });

  it('L9 — deleting a location removes its alert subscriptions (3.1.11, 3.1.12)', async () => {
    const location = await save(f, CENTRE);
    f.subscriptions.add(location.id);
    f.subscriptions.add(location.id);

    const result = await f.locations.removeLocation(location.id, RESIDENT);
    expect(result.subscriptionsRemoved).toBe(2);
    expect(await f.store.findById(location.id)).toBeNull();
    // An orphaned subscription still fires, and it is the alert nobody can turn off.
    expect(f.subscriptions.countFor(location.id)).toBe(0);
  });

  it('L10 — one resident cannot delete another resident\'s location (2.3.1)', async () => {
    const location = await save(f, CENTRE, RESIDENT);
    await expect(f.locations.removeLocation(location.id, OTHER)).rejects.toBeInstanceOf(NotAuthorised);
    expect(await f.store.findById(location.id)).not.toBeNull();
  });
});

describe('Exposure — §3.1.8, §3.1.9, §3.1.10', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('E1 — a location inside a cluster boundary is IN_CLUSTER at distance 0 (3.1.9)', async () => {
    const location = await save(f, CENTRE);
    expect(location.exposureStatus).toBe(ExposureStatus.IN_CLUSTER);
    expect(location.exposure.distanceMetres).toBe(0);
    expect(location.isExposed()).toBe(true);
  });

  it('E2 — 149 m from the boundary is WITHIN_150M; 151 m is CLEAR (3.1.9, boundary)', async () => {
    const edge = HALF_SIDE_M; // the northern edge, measured from the centre
    const near = await save(f, offsetNorth(CENTRE, edge + 149), RESIDENT, 'Near');
    const far = await save(f, offsetNorth(CENTRE, edge + 151), RESIDENT, 'Far');
    expect(near.exposureStatus).toBe(ExposureStatus.WITHIN_150M);
    expect(far.exposureStatus).toBe(ExposureStatus.CLEAR);
  });

  it('E3 — exactly 150 m is WITHIN_150M: the band is inclusive (3.1.9, boundary)', () => {
    // Asserted on the pure function, where the distance is exact and no geometry rounds it.
    expect(SavedLocation.statusFor(NEAR_CLUSTER_METRES)).toBe(ExposureStatus.WITHIN_150M);
    expect(SavedLocation.statusFor(NEAR_CLUSTER_METRES + 0.001)).toBe(ExposureStatus.CLEAR);
    expect(SavedLocation.statusFor(0)).toBe(ExposureStatus.IN_CLUSTER);
    expect(SavedLocation.statusFor(null)).toBe(ExposureStatus.CLEAR);
  });

  it('E4 — distance is measured to the BOUNDARY, not the centroid (3.1.9)', async () => {
    // 100 m outside a cluster 400 m across: 300 m from the centre. Measured from the centroid this
    // would read CLEAR, and a resident on the cluster's doorstep would be told they are fine.
    const location = await save(f, offsetNorth(CENTRE, HALF_SIDE_M + 100));
    expect(location.exposureStatus).toBe(ExposureStatus.WITHIN_150M);
    expect(location.exposure.distanceMetres).toBeGreaterThan(90);
    expect(location.exposure.distanceMetres).toBeLessThan(110);
  });

  it('E5 — a CLEAR location still reports the nearest cluster and its case size (3.1.10)', async () => {
    const location = await save(f, offsetNorth(CENTRE, HALF_SIDE_M + 500));
    const card = location.card();
    expect(card.status).toBe(ExposureStatus.CLEAR);
    // "Clear, and the nearest cluster is 500 m away with 31 cases" is a more useful card than
    // "clear", which is why the search radius is wider than the band.
    expect(card.cluster).toBe('Marsiling Rise');
    expect(card.caseSize).toBe(31);
  });

  it('E6 — the card carries the feed timestamp and the evaluation time separately (3.1.10)', async () => {
    const at = new Date('2026-09-03T12:00:00+08:00');
    const location = await save(f, CENTRE);
    await f.locations.evaluateExposure([location], at);
    const card = location.card();
    expect(card.evaluatedAt).toEqual(at);
    // The feed was published at 10:06 and checked at 12:00 — two facts, and a card showing only
    // one of them misleads whichever way it is read.
    expect(card.dataTimestamp?.toISOString()).toBe(new Date('2026-09-03T10:06:00+08:00').toISOString());
  });

  it('E7 — an unevaluated location does not claim to have been checked (3.1.10)', () => {
    const fresh = new SavedLocation();
    // A timestamp of "now" on an unevaluated location reads as "checked just now and found clear",
    // which is a false statement rather than a missing one.
    expect(fresh.evaluatedAt).toBeUndefined();
  });

  it('E8 — re-evaluation reports which locations CHANGED status, for 6.1.2 to alert on', async () => {
    const location = await save(f, offsetNorth(CENTRE, HALF_SIDE_M + 500));
    expect(location.exposureStatus).toBe(ExposureStatus.CLEAR);

    // The resident has not moved; the cluster has grown around them. That is exactly the event
    // 6.1.2 wants to alert on, and it is only detectable by comparing against the previous status.
    location.point = CENTRE;
    const changed = await f.locations.evaluateExposure([location]);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.from).toBe(ExposureStatus.CLEAR);
    expect(changed[0]?.location.exposureStatus).toBe(ExposureStatus.IN_CLUSTER);
  });

  it('E9 — an unchanged status is not reported as a change', async () => {
    const location = await save(f, CENTRE);
    expect(await f.locations.evaluateExposure([location])).toHaveLength(0);
  });

  it('E10 — evaluateAll covers every resident\'s locations (3.1.8)', async () => {
    await save(f, CENTRE, RESIDENT, 'Mine');
    await save(f, CENTRE, OTHER, 'Theirs');
    const at = new Date();
    await f.locations.evaluateAll(at);
    for (const location of await f.store.all()) {
      expect(location.evaluatedAt).toEqual(at);
    }
  });
});
