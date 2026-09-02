/**
 * D-Fence — IngestionRunRepository.
 * Stereotype: <<persistence>>. Traces: 1.4.x
 */
import { Repository } from '../ports/Repository';
import { Database } from './Database';
import { IngestionRun, Uuid, GeoPoint, SourceKind, WorkOrderStatus, ClusterSnapshot, SourceHealth } from '../entity';

export class IngestionRunRepository implements Repository<IngestionRun> {
  constructor(private readonly db: Database) {}

  findById(id: Uuid): Promise<IngestionRun | null> {
    throw new Error('not implemented');
  }

  save(entity: IngestionRun): Promise<IngestionRun> {
    throw new Error('not implemented');
  }

  delete(id: Uuid): Promise<void> {
    throw new Error('not implemented');
  }

  recordStart(source: SourceKind): Promise<IngestionRun> {
    // TODO
    throw new Error('not implemented');
  }

  recordOutcome(run: IngestionRun): Promise<void> {
    // TODO
    throw new Error('not implemented');
  }

  /** 1.4.x, 10.2.2. */
  health(): Promise<SourceHealth[]> {
    // TODO
    throw new Error('not implemented');
  }

}
