/**
 * D-Fence — domain events (Observer).
 * Traces: 1.1.x, 4.1.x, 6.x.
 *
 * Ingestion must trigger rescoring and alert evaluation without the ingestion jobs knowing who
 * listens. Adding a subscriber later — the Lab 5 extensibility argument — touches no existing job.
 */
export enum EventKind {
  IngestionCompleted = 'IngestionCompleted',
  ClusterChanged = 'ClusterChanged',
  TreatmentRecorded = 'TreatmentRecorded',
  ReportVerified = 'ReportVerified',
}

export interface DomainEvent {
  readonly kind: EventKind;
  readonly occurredAt: Date;
  readonly payload: unknown;
}

export interface DomainEventSubscriber {
  handles(): EventKind[];
  on(event: DomainEvent): Promise<void>;
}

export class DomainEventPublisher {
  private readonly subscribers = new Map<EventKind, DomainEventSubscriber[]>();

  subscribe(_kind: EventKind, _s: DomainEventSubscriber): void {
    throw new Error('not implemented');
  }

  /**
   * A subscriber that throws must not fail the publisher: 10.2.1 keeps the system available
   * when one part is broken, and a failed rescore must not roll back a successful ingestion.
   */
  publish(_event: DomainEvent): Promise<void> {
    throw new Error('not implemented');
  }
}
