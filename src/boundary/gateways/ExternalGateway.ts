/**
 * D-Fence — external gateway interfaces (Adapter).
 * Stereotype: <<boundary>>. Traces: 10.2.1, 10.2.2, 10.4.6, 10.6.3.
 *
 * The control layer depends on these interfaces, never on a concrete gateway. That is what
 * lets a control class be unit-tested against a fake (10.6.3), and it is why the two sources
 * still unverified — the NEA feed's update frequency and OneMap Search — cost one file each
 * if they turn out to behave differently from the documentation.
 */
import { SourceKind } from '../../entity/enums';
import { GeoPoint } from '../../entity/valueTypes';
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

export interface GeocodingSource extends ExternalGateway {
  search(address: string): Promise<GeoPoint[]>;
}

export interface NotificationChannel {
  send(chatId: string, text: string): Promise<import('../../entity/enums').DeliveryOutcome>;
}
