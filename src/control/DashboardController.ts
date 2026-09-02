/**
 * D-Fence — DashboardController.
 * Stereotype: <<control>>. Realises use cases 5.1-5.4; 7.1-7.5
 */
import { Role, ReportType, DeliveryOutcome } from '../entity/enums';
import { Uuid, GeoPoint } from '../entity/valueTypes';
import { Principal } from './Principal';

// TODO: narrow these to the entities this controller actually touches once the bodies exist.
type Account = unknown; type SavedLocation = unknown; type SavedLocationDraft = unknown;
type Report = unknown; type ReportDraft = unknown; type Alert = unknown;
type Cluster = unknown; type PriorityScore = unknown; type SourceHealth = unknown;
type DashboardOverview = unknown; type AttentionItem = unknown;

export class DashboardController {
  // TODO: repositories and collaborators are injected by AppConfigurator.

  /** 7.1.x. */
  buildOverview(by: Principal): Promise<DashboardOverview> {
    throw new Error('not implemented');
  }

  /** 7.2.x. Reads stored scores; never rescoring for display. */
  buildPriorityTable(by: Principal): Promise<PriorityScore[]> {
    throw new Error('not implemented');
  }

  /** 7.5.x — including work orders carrying an issue flag (7.5.5, added in v0.4 after the Lab 2 review found no requirement obliged this). */
  buildAttentionPanel(by: Principal): Promise<AttentionItem[]> {
    throw new Error('not implemented');
  }

  /** 7.4.x, 10.2.2. */
  reportSourceHealth(): Promise<SourceHealth[]> {
    throw new Error('not implemented');
  }

}
