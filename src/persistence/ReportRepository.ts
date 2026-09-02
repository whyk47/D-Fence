/**
 * D-Fence — ReportRepository.
 * Stereotype: <<persistence>>. Traces: 5.1.x, 5.3.x, 8.3.21
 */
import { Repository } from './Repository';
import { Database } from './Database';
import { Report, Uuid, GeoPoint, SourceKind, WorkOrderStatus, ClusterSnapshot, SourceHealth } from '../entity';
import { ParsedBatch } from '../boundary/gateways/types';

export class ReportRepository implements Repository<Report> {
  constructor(private readonly db: Database) {}

  findById(id: Uuid): Promise<Report | null> {
    throw new Error('not implemented');
  }

  save(entity: Report): Promise<Report> {
    throw new Error('not implemented');
  }

  delete(id: Uuid): Promise<void> {
    throw new Error('not implemented');
  }

  /** 2.3.2: a Resident reads only their own. */
  findByReporter(accountId: Uuid): Promise<Report[]> {
    // TODO
    throw new Error('not implemented');
  }

  /** 5.3.x moderation queue. */
  findPendingModeration(): Promise<Report[]> {
    // TODO
    throw new Error('not implemented');
  }

  /** Duplicate detection (5.1.x). */
  findNearbyOpen(p: GeoPoint, metres: number): Promise<Report[]> {
    // TODO
    throw new Error('not implemented');
  }

  /** Needed to restore status on cancellation (8.3.21). */
  findByWorkOrder(id: Uuid): Promise<Report[]> {
    // TODO
    throw new Error('not implemented');
  }

}
