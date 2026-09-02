/**
 * D-Fence — ReportController.
 * Stereotype: <<control>>. Realises use cases 3.1-3.3; 5.1.x, 5.2.x
 */
import { Role, ReportType, DeliveryOutcome } from '../entity/enums';
import { Uuid, GeoPoint } from '../entity/valueTypes';
import { Principal } from './Principal';

// TODO: narrow these to the entities this controller actually touches once the bodies exist.
type Account = unknown; type SavedLocation = unknown; type SavedLocationDraft = unknown;
type Report = unknown; type ReportDraft = unknown; type Alert = unknown;
type Cluster = unknown; type PriorityScore = unknown; type SourceHealth = unknown;
type DashboardOverview = unknown; type AttentionItem = unknown;

export class ReportController {
  // TODO: repositories and collaborators are injected by AppConfigurator.

  /** 5.1.7 binds the report to its containing cluster at submission — a PostGIS point-in-polygon query. */
  submitReport(draft: ReportDraft, by: Principal): Promise<Report> {
    throw new Error('not implemented');
  }

  /** Nearby open reports of the same type. Feeds the one modal in the dialog map. */
  detectDuplicate(point: GeoPoint, type: ReportType): Promise<Report[]> {
    throw new Error('not implemented');
  }

  /** Corroboration rather than a second report. */
  confirmExisting(reportId: Uuid, by: Principal): Promise<void> {
    throw new Error('not implemented');
  }

  /** 2.3.2: a Resident sees only their own. */
  listOwnReports(by: Principal): Promise<Report[]> {
    throw new Error('not implemented');
  }

}
