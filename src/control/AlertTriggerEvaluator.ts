/**
 * D-Fence — AlertTriggerEvaluator.
 * Stereotype: <<control>>. Realises use cases 7.6; 6.x
 */
import { Role, ReportType, DeliveryOutcome } from '../entity/enums';
import { Uuid, GeoPoint } from '../entity/valueTypes';
import { Principal } from './Principal';
import { DomainEvent, DomainEventSubscriber, EventKind } from './DomainEventPublisher';

// TODO: narrow these to the entities this controller actually touches once the bodies exist.
type Account = unknown; type SavedLocation = unknown; type SavedLocationDraft = unknown;
type Report = unknown; type ReportDraft = unknown; type Alert = unknown;
type Cluster = unknown; type PriorityScore = unknown; type SourceHealth = unknown;
type DashboardOverview = unknown; type AttentionItem = unknown;

export class AlertTriggerEvaluator implements DomainEventSubscriber {
  // TODO: repositories and collaborators are injected by AppConfigurator.

  // --- Observer: evaluate triggers when ingestion changes the cluster picture -----------------
  handles(): EventKind[] {
    return [EventKind.ClusterChanged, EventKind.IngestionCompleted];
  }

  async on(_event: DomainEvent): Promise<void> {
    // TODO(F7): evaluate only the clusters the event names.
    throw new Error('not implemented');
  }

  /** Entered-cluster, growth-over-threshold and heavy-rain triggers. */
  evaluateTriggers(changed: Cluster[]): Promise<Alert[]> {
    throw new Error('not implemented');
  }

  /** PostGIS ST_DWithin, not client arithmetic. */
  isWithin150m(loc: SavedLocation, c: Cluster): Promise<boolean> {
    throw new Error('not implemented');
  }

  /** A cluster that grows hourly must not produce hourly messages. */
  applyDailyCap(accountId: Uuid, candidates: Alert[]): Alert[] {
    throw new Error('not implemented');
  }

}
