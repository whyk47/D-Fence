/**
 * D-Fence — AuditRecordRepository.
 * Stereotype: <<persistence>>. Traces: 2.3.8, 2.4.x
 */
import { Repository } from '../ports/Repository';
import { Database } from './Database';
import { AuditRecord, Uuid, GeoPoint, SourceKind, WorkOrderStatus, ClusterSnapshot, SourceHealth } from '../entity';

export class AuditRecordRepository implements Repository<AuditRecord> {
  constructor(private readonly db: Database) {}

  findById(id: Uuid): Promise<AuditRecord | null> {
    throw new Error('not implemented');
  }

  save(entity: AuditRecord): Promise<AuditRecord> {
    throw new Error('not implemented');
  }

  delete(id: Uuid): Promise<void> {
    throw new Error('not implemented');
  }

  /** 2.3.8: every refusal is logged. */
  append(record: AuditRecord): Promise<void> {
    // TODO
    throw new Error('not implemented');
  }

}
