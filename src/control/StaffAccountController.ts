/**
 * D-Fence — StaffAccountController.
 * Stereotype: <<control>>. Realises use cases 1.4; 2.2.x
 */
import { Role, ReportType, DeliveryOutcome } from '../entity/enums';
import { Uuid, GeoPoint } from '../entity/valueTypes';
import { Principal } from './Principal';

// TODO: narrow these to the entities this controller actually touches once the bodies exist.
type Account = unknown; type SavedLocation = unknown; type SavedLocationDraft = unknown;
type Report = unknown; type ReportDraft = unknown; type Alert = unknown;
type Cluster = unknown; type PriorityScore = unknown; type SourceHealth = unknown;
type DashboardOverview = unknown; type AttentionItem = unknown;

export class StaffAccountController {
  // TODO: repositories and collaborators are injected by AppConfigurator.

  /** Manager only. */
  createStaffAccount(email: string, role: Role, by: Principal): Promise<Account> {
    throw new Error('not implemented');
  }

  /** Deactivation, not deletion: audit records must still resolve. */
  deactivateAccount(id: Uuid, by: Principal): Promise<void> {
    throw new Error('not implemented');
  }

}
