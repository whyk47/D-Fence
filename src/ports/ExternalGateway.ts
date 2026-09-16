/**
 * D-Fence — external gateway interfaces (Adapter).
 * Layer: ports — the interfaces, not the adapters. Traces: 10.2.1, 10.2.2, 10.4.6, 10.6.3.
 *
 * The control layer depends on these interfaces, never on a concrete gateway — and they live in
 * `ports/` rather than in `boundary/` precisely so that the dependency runs control -> ports and
 * boundary -> ports, with no arrow from control into boundary. That is dependency inversion made
 * structural instead of promised: a control class can be unit-tested against a fake (10.6.3), and
 * the two sources still unverified — the NEA feed's update frequency and OneMap Search — cost one
 * adapter file each if they behave differently from the documentation.
 */
import { SourceKind, DeliveryOutcome } from '../entity/enums';
import { GeoPoint } from '../entity/valueTypes';
import { RawPayload } from './types';

export interface ExternalGateway {
  sourceKind(): SourceKind;
  isHealthy(): Promise<boolean>;
}

export interface ClusterSource extends ExternalGateway {
  fetchClusters(): Promise<RawPayload>;
}

export interface RainfallSource extends ExternalGateway {
  fetchStations(): Promise<RawPayload>;
  fetchReadings(since: Date): Promise<RawPayload>;
}

export interface ForecastSource extends ExternalGateway {
  /** Five macro-regions, NOT the 45 named areas of the 2-hour nowcast. 1.3.x. */
  fetch24hForecast(): Promise<RawPayload>;
}

/**
 * One geocoding match. 3.1.4 asks for candidates to be **presented for confirmation**, and a bare
 * coordinate pair cannot be confirmed by a person — "1.3521, 103.8198" tells a resident nothing.
 * The address and postal code are what makes the choice answerable.
 */
export interface GeocodeCandidate {
  point: GeoPoint;
  address: string;
  postalCode: string | null;
}

/**
 * 1.5 — third-party wildlife observations. One taxon per call (1.5.2), because the supplier's API
 * takes one `taxon_id` and because a combined call would make a per-pest rejection count (1.5.8)
 * impossible to attribute.
 */
export interface ObservationSource extends ExternalGateway {
  /** @param since ISO date, `YYYY-MM-DD`. 1.5.5's 90-day window is the caller's to choose. */
  fetchObservations(taxonId: number, since: string): Promise<RawPayload>;
}

/**
 * 1.6 — the NEA registered vector control operator registry. **Reference data, not a feed.** It has
 * no `since`, no polling and no freshness: the dataset's own `lastUpdatedAt` was 2024-06-06 when it
 * was verified, and 1.6.7 forbids presenting it as live.
 */
export interface OperatorRegistrySource extends ExternalGateway {
  fetchRegistry(): Promise<RawPayload>;
  /** 1.6.7 — the source dataset's publication date. Null when the publisher gives none. */
  fetchPublishedAt(): Promise<Date | null>;
}

export interface GeocodingSource extends ExternalGateway {
  /** 3.1.3. Empty when the address does not exist (3.1.5); throws when the service is unwell (3.1.17). */
  search(address: string): Promise<GeocodeCandidate[]>;
  /** 3.1.14, 3.1.15 — mint a fresh token. On the port because the *schedule* is a control concern. */
  requestToken(): Promise<void>;
}

export interface NotificationChannel {
  send(chatId: string, text: string): Promise<DeliveryOutcome>;
}
