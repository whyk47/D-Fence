/**
 * D-Fence — ingestion coordination and source health.
 * Stereotype: <<control>>. Traces: 1.1.x-1.4.x, 10.2.3.
 */
import { SourceKind } from '../entity/enums';
import { IngestionRun } from '../entity/IngestionRun';
import { SourceHealth } from '../entity/SourceHealth';
import { AbstractIngestionJob } from './ingestion/AbstractIngestionJob';
import { DomainEventPublisher } from './DomainEventPublisher';

export class IngestionController {
  constructor(
    private readonly jobs: Map<SourceKind, AbstractIngestionJob>,
    private readonly publisher: DomainEventPublisher,
  ) {}

  /** Runs one source's job and publishes IngestionCompleted so scoring and alerts follow. */
  runIngestion(_kind: SourceKind): Promise<IngestionRun> {
    throw new Error('not implemented');
  }

  /** 1.4.x, 10.2.2 — what the Data Sources screen displays. */
  reportSourceHealth(): Promise<SourceHealth[]> {
    throw new Error('not implemented');
  }

  /** 10.2.3: called by AppConfigurator at startup, so a restart does not stall ingestion. */
  resumeAfterRestart(): Promise<void> {
    throw new Error('not implemented');
  }
}
