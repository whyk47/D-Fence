/**
 * D-Fence — AlertSubscriptionController.
 * Stereotype: <<control>>. Realises use cases 4.1, 4.2; 6.x
 */
import { Role, ReportType, DeliveryOutcome } from '../entity/enums';
import { Uuid, GeoPoint } from '../entity/valueTypes';
import { Principal } from './Principal';

// TODO: narrow these to the entities this controller actually touches once the bodies exist.
type Account = unknown; type SavedLocation = unknown; type SavedLocationDraft = unknown;
type Report = unknown; type ReportDraft = unknown; type Alert = unknown;
type Cluster = unknown; type PriorityScore = unknown; type SourceHealth = unknown;
type DashboardOverview = unknown; type AttentionItem = unknown;

export class AlertSubscriptionController {
  // TODO: repositories and collaborators are injected by AppConfigurator.

  /** One-time code the resident sends to the bot. */
  generateLinkCode(by: Principal): Promise<string> {
    throw new Error('not implemented');
  }

  /** Completes the link from the Telegram side. */
  linkTelegramChat(code: string, chatId: string): Promise<void> {
    throw new Error('not implemented');
  }

  setLocationAlerts(locationId: Uuid, enabled: boolean, by: Principal): Promise<void> {
    throw new Error('not implemented');
  }

  setGrowthThreshold(locationId: Uuid, threshold: number, by: Principal): Promise<void> {
    throw new Error('not implemented');
  }

}
