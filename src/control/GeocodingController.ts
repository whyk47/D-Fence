/**
 * D-Fence — GeocodingController.
 * Stereotype: <<control>>. Realises use cases 8.1, 7.7
 */
import { Role, ReportType, DeliveryOutcome } from '../entity/enums';
import { Uuid, GeoPoint } from '../entity/valueTypes';
import { Principal } from './Principal';

// TODO: narrow these to the entities this controller actually touches once the bodies exist.
type Account = unknown; type SavedLocation = unknown; type SavedLocationDraft = unknown;
type Report = unknown; type ReportDraft = unknown; type Alert = unknown;
type Cluster = unknown; type PriorityScore = unknown; type SourceHealth = unknown;
type DashboardOverview = unknown; type AttentionItem = unknown;

export class GeocodingController {
  // TODO: repositories and collaborators are injected by AppConfigurator.

  /** OneMap Search — still not test-pulled. */
  geocode(text: string): Promise<GeoPoint[]> {
    throw new Error('not implemented');
  }

  /** Tokens last three days; refreshed every 48 hours. */
  refreshToken(): Promise<void> {
    throw new Error('not implemented');
  }

}
