/**
 * D-Fence — ModerationController.
 * Stereotype: <<control>>. Realises use cases 3.4; 5.3.x
 */
import { Role, ReportType, DeliveryOutcome } from '../entity/enums';
import { Uuid, GeoPoint } from '../entity/valueTypes';
import { Principal } from './Principal';

// TODO: narrow these to the entities this controller actually touches once the bodies exist.
type Account = unknown; type SavedLocation = unknown; type SavedLocationDraft = unknown;
type Report = unknown; type ReportDraft = unknown; type Alert = unknown;
type Cluster = unknown; type PriorityScore = unknown; type SourceHealth = unknown;
type DashboardOverview = unknown; type AttentionItem = unknown;

export class ModerationController {
  // TODO: repositories and collaborators are injected by AppConfigurator.

  listQueue(by: Principal): Promise<Report[]> {
    throw new Error('not implemented');
  }

  /** Includes 4.3 Notify Resident — critique point 2 from Lab 2. */
  verify(id: Uuid, by: Principal): Promise<Report> {
    throw new Error('not implemented');
  }

  /** Reason required; the reporter is told. */
  reject(id: Uuid, reason: string, by: Principal): Promise<Report> {
    throw new Error('not implemented');
  }

}
