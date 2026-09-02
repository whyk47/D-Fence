/**
 * D-Fence — TreatmentRecordRepository.
 * Stereotype: <<persistence>>. Traces: 8.3.12
 */
import { Repository } from '../ports/Repository';
import { Database } from './Database';
import { TreatmentRecord, Uuid, GeoPoint, SourceKind, WorkOrderStatus, ClusterSnapshot, SourceHealth } from '../entity';

export class TreatmentRecordRepository implements Repository<TreatmentRecord> {
  constructor(private readonly db: Database) {}

  findById(id: Uuid): Promise<TreatmentRecord | null> {
    throw new Error('not implemented');
  }

  save(entity: TreatmentRecord): Promise<TreatmentRecord> {
    throw new Error('not implemented');
  }

  delete(id: Uuid): Promise<void> {
    throw new Error('not implemented');
  }

  /** Feeds the DaysSinceLastTreatment driver (4.1.15, defaulting to 90 days under 4.1.16). */
  findLatestForCluster(clusterId: Uuid): Promise<TreatmentRecord | null> {
    // TODO
    throw new Error('not implemented');
  }

}
