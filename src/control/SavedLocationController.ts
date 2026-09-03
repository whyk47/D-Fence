/**
 * D-Fence — saved locations and their exposure.
 * Stereotype: <<control>>. Realises use cases 2.1–2.4. Traces: 3.1.1–3.1.12, 6.1.2.
 *
 * Adding a location is **two steps, not one**: the resident searches, then confirms one of the
 * candidates 3.1.4 requires to be presented. A single call that silently took OneMap's first
 * result would save a round trip and would also, quietly and regularly, save the wrong flat —
 * "Blk 123" matches in four towns.
 */
import { ExposureStatus, LocationLabel } from '../entity/enums';
import { GeoPoint, Uuid } from '../entity/valueTypes';
import { SavedLocation, ExposureDetail, MAX_LOCATION_NAME_CHARS, MAX_SAVED_LOCATIONS } from '../entity/SavedLocation';
import { GeocodeCandidate } from '../ports/ExternalGateway';
import { AlertSubscriptionStore, ClusterLocator, RainfallReadingSource, SavedLocationStore } from '../ports/Stores';
import { AccessControlService } from './AccessControlService';
import { GeocodingController } from './GeocodingController';
import { Principal } from './Principal';

/** A submission refused on its own terms — the limit, the label, the name length. */
export class LocationRejected extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'LocationRejected';
  }
}

export interface SavedLocationDraft {
  /** One of the candidates returned by `search`, chosen by the resident (3.1.4). */
  candidate: GeocodeCandidate;
  label: LocationLabel;
  name?: string;
  /** What they originally typed, carried through so the card can show it (3.1.2). */
  inputText: string;
}

export class SavedLocationController {
  constructor(
    private readonly ac: AccessControlService,
    private readonly locations: SavedLocationStore,
    private readonly locator: ClusterLocator,
    private readonly geocoding: GeocodingController,
    /** 3.1.12 — a location's subscriptions go with it. Optional until E6 exists. */
    private readonly subscriptions: AlertSubscriptionStore | null = null,
    /** 6.1.x — rainfall at the location, for the resident's card. Optional. */
    private readonly rainfall: RainfallReadingSource | null = null,
  ) {}

  /**
   * 3.1.2, 3.1.3, 3.1.4 — step one. The resident types a postal code or an address and gets
   * candidates back.
   *
   * @throws AddressNotFound (3.1.13) or GeocodingUnavailable (3.1.17) — two different sentences
   */
  async search(text: string, by: Principal): Promise<GeocodeCandidate[]> {
    await this.ac.authorise(by, 'savedLocation:write', { kind: 'savedLocation', ownerId: by.accountId });
    return this.geocoding.geocode(text);
  }

  /**
   * 3.1.1, 3.1.6, 3.1.7 — step two. Stores the confirmed candidate.
   *
   * The five-location limit is checked here rather than at the screen: 3.1.1 is a rule about what
   * the system stores, and a client-side check is a suggestion.
   *
   * @throws LocationRejected
   */
  async addLocation(draft: SavedLocationDraft, by: Principal, now = new Date()): Promise<SavedLocation> {
    await this.ac.authorise(by, 'savedLocation:write', { kind: 'savedLocation', ownerId: by.accountId });

    const existing = await this.locations.findForAccount(by.accountId);
    if (existing.length >= MAX_SAVED_LOCATIONS) {
      throw new LocationRejected(
        `you already have ${MAX_SAVED_LOCATIONS} saved locations; delete one before adding another (3.1.1)`,
      );
    }
    if (!Object.values(LocationLabel).includes(draft.label)) {
      throw new LocationRejected(`${String(draft.label)} is not one of the four labels (3.1.6)`);
    }
    const name = (draft.name ?? '').trim();
    if (name.length > MAX_LOCATION_NAME_CHARS) {
      throw new LocationRejected(`a name may be at most ${MAX_LOCATION_NAME_CHARS} characters (3.1.7)`);
    }

    const location = new SavedLocation();
    location.accountId = by.accountId;
    location.inputText = draft.inputText;
    location.resolvedAddress = draft.candidate.address;
    location.point = draft.candidate.point;
    location.label = draft.label;
    // 3.1.7 makes the name optional, so an unnamed location falls back to its label rather than
    // rendering as an empty card title.
    location.name = name === '' ? draft.label : name;
    location.exposureStatus = ExposureStatus.CLEAR;
    location.exposure = SavedLocationController.emptyExposure();
    location.rain24hMm = null;
    location.rain72hMm = null;
    // Deliberately null until the first evaluation: an unevaluated location must not read as
    // "checked just now and found clear", which is what a timestamp of `now` would say.
    location.evaluatedAt = null;

    const saved = await this.locations.save(location);
    // Evaluated immediately, so the card is meaningful on the screen the resident lands on rather
    // than at the next ingestion cycle up to an hour later.
    await this.evaluateExposure([saved], now);
    return saved;
  }

  /** 2.3.1 — a Resident reads only their own. */
  async listLocations(by: Principal): Promise<SavedLocation[]> {
    await this.ac.authorise(by, 'savedLocation:read', { kind: 'savedLocation', ownerId: by.accountId });
    return this.locations.findForAccount(by.accountId);
  }

  /**
   * 3.1.11, 3.1.12, 2.3.1. Deletes the location and every alert subscription attached to it.
   *
   * The ownership check is explicit rather than implied by the query: `findById` then compare, so
   * deleting somebody else's location is refused by the access rule rather than by happening to
   * return nothing.
   */
  async removeLocation(id: Uuid, by: Principal): Promise<{ subscriptionsRemoved: number }> {
    const location = await this.locations.findById(id);
    await this.ac.authorise(by, 'savedLocation:write', {
      kind: 'savedLocation',
      id,
      ownerId: location?.accountId,
    });
    if (location === null) {
      throw new LocationRejected('no such saved location');
    }
    // 3.1.12 first: a subscription whose location has already gone is an orphan that will still
    // try to fire, and it is the alert nobody can turn off.
    const subscriptionsRemoved = (await this.subscriptions?.deleteForLocation(id)) ?? 0;
    await this.locations.delete(id);
    return { subscriptionsRemoved };
  }

  /**
   * 3.1.8, 3.1.9, 3.1.10 — evaluate each location against every active cluster boundary.
   *
   * Called on every cluster ingestion cycle, and once when a location is added. The distance comes
   * from `ClusterLocator`, so the answer is PostGIS's in production and arithmetic in a test, and
   * neither the screen nor this class ever re-derives containment for itself.
   *
   * @returns the locations whose status **changed**, which is what 6.1.2's alert generation needs
   */
  async evaluateExposure(locations: SavedLocation[], now = new Date()): Promise<Array<{ location: SavedLocation; from: ExposureStatus }>> {
    const changed: Array<{ location: SavedLocation; from: ExposureStatus }> = [];
    for (const location of locations) {
      const before = location.exposureStatus;
      // Searched well past the 150 m band, because 3.1.10 wants the nearest cluster's name and
      // case size on the card even when the answer is CLEAR. The status is decided by the
      // distance, not by the search radius — `SavedLocation.statusFor` is the only place that
      // judgement is made.
      const nearest = await this.locator.nearestWithin(location.point, SavedLocationController.searchRadius());
      const status = SavedLocation.statusFor(nearest?.distanceMetres ?? null);

      location.exposureStatus = status;
      location.exposure =
        nearest === null
          ? SavedLocationController.emptyExposure()
          : {
              clusterId: nearest.cluster.id,
              clusterLocality: nearest.cluster.locality,
              caseSize: nearest.cluster.caseSize,
              distanceMetres: Math.round(nearest.distanceMetres),
              // 3.1.10's "data timestamp" is the feed's, not ours.
              dataTimestamp: nearest.cluster.lastUpdatedAt ?? null,
            };
      location.evaluatedAt = now;
      if (this.rainfall !== null) {
        const rain = await this.rainfall.forPoint(location.point, now);
        location.rain24hMm = rain?.accum24hMm ?? null;
        location.rain72hMm = rain?.accum72hMm ?? null;
      }
      await this.locations.save(location);
      if (status !== before) {
        changed.push({ location, from: before });
      }
    }
    return changed;
  }

  /** 3.1.8 — every saved location in the system, for the ingestion cycle to re-evaluate. */
  async evaluateAll(now = new Date()): Promise<Array<{ location: SavedLocation; from: ExposureStatus }>> {
    return this.evaluateExposure(await this.locations.all(), now);
  }

  /**
   * The radius the locator is asked about. Wider than the 150 m band on purpose: 3.1.10 wants the
   * **nearest** cluster's name and case size on the card even when the answer is CLEAR, and a
   * search that stopped at the band could never supply one.
   */
  private static searchRadius(): number {
    return 2000;
  }

  private static emptyExposure(): ExposureDetail {
    return { clusterId: null, clusterLocality: null, caseSize: null, distanceMetres: null, dataTimestamp: null };
  }
}
