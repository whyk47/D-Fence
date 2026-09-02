/**
 * D-Fence — AlertRepository.
 * Stereotype: <<persistence>>. Traces: 6.x
 */
import { Repository } from '../ports/Repository';
import { Database } from './Database';
import { Alert, Uuid, GeoPoint, SourceKind, WorkOrderStatus, ClusterSnapshot, SourceHealth } from '../entity';

export class AlertRepository implements Repository<Alert> {
  constructor(private readonly db: Database) {}

  findById(id: Uuid): Promise<Alert | null> {
    throw new Error('not implemented');
  }

  save(entity: Alert): Promise<Alert> {
    throw new Error('not implemented');
  }

  delete(id: Uuid): Promise<void> {
    throw new Error('not implemented');
  }

  /** The daily cap in 6.x. */
  countSentToday(accountId: Uuid): Promise<number> {
    // TODO
    throw new Error('not implemented');
  }

}
