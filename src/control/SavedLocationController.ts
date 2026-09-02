/**
 * D-Fence — SavedLocationController.
 * Stereotype: <<control>>. Realises use cases 2.1-2.4; 3.1.x
 */
import { Role, ReportType, DeliveryOutcome } from '../entity/enums';
import { Uuid, GeoPoint } from '../entity/valueTypes';
import { Principal } from './Principal';

// TODO: narrow these to the entities this controller actually touches once the bodies exist.
type Account = unknown; type SavedLocation = unknown; type SavedLocationDraft = unknown;
type Report = unknown; type ReportDraft = unknown; type Alert = unknown;
type Cluster = unknown; type PriorityScore = unknown; type SourceHealth = unknown;
type DashboardOverview = unknown; type AttentionItem = unknown;

export class SavedLocationController {
  // TODO: repositories and collaborators are injected by AppConfigurator.

  /** Max 5 per account. */
  addLocation(draft: SavedLocationDraft, by: Principal): Promise<SavedLocation> {
    throw new Error('not implemented');
  }

  removeLocation(id: Uuid, by: Principal): Promise<void> {
    throw new Error('not implemented');
  }

  /** 3.1.8, on every ingestion cycle. Containment and the 150 m band are answered by PostGIS via ClusterRepository, never by Polygon.contains(). */
  evaluateExposure(locations: SavedLocation[]): Promise<void> {
    throw new Error('not implemented');
  }

}
