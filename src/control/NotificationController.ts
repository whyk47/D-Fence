/**
 * D-Fence — NotificationController.
 * Stereotype: <<control>>. Realises use cases 4.3, 4.4; 6.x, 8.2.4, 8.3.11
 */
import { Role, ReportType, DeliveryOutcome } from '../entity/enums';
import { Uuid, GeoPoint } from '../entity/valueTypes';
import { Principal } from './Principal';

// TODO: narrow these to the entities this controller actually touches once the bodies exist.
type Account = unknown; type SavedLocation = unknown; type SavedLocationDraft = unknown;
type Report = unknown; type ReportDraft = unknown; type Alert = unknown;
type Cluster = unknown; type PriorityScore = unknown; type SourceHealth = unknown;
type DashboardOverview = unknown; type AttentionItem = unknown;

export class NotificationController {
  // TODO: repositories and collaborators are injected by AppConfigurator.

  notifyResident(alert: Alert): Promise<DeliveryOutcome> {
    throw new Error('not implemented');
  }

  /** Use case 4.4 — added after the Lab 1 critique found 8.2.4, 8.2.6 and 8.3.11 unrepresented. */
  notifyCrewMember(accountId: Uuid, text: string): Promise<DeliveryOutcome> {
    throw new Error('not implemented');
  }

  /** A failed send must not lose the alert (10.2.4). */
  retryDelivery(alertId: Uuid): Promise<DeliveryOutcome> {
    throw new Error('not implemented');
  }

}
