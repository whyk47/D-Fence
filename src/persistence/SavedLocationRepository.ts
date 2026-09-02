/**
 * D-Fence — SavedLocationRepository.
 * Stereotype: <<persistence>>. Traces: 3.1.x
 */
import { Repository } from '../ports/Repository';
import { Database } from './Database';
import { SavedLocation, Uuid, GeoPoint, SourceKind, WorkOrderStatus, ClusterSnapshot, SourceHealth } from '../entity';

export class SavedLocationRepository implements Repository<SavedLocation> {
  constructor(private readonly db: Database) {}

  findById(id: Uuid): Promise<SavedLocation | null> {
    throw new Error('not implemented');
  }

  save(entity: SavedLocation): Promise<SavedLocation> {
    throw new Error('not implemented');
  }

  delete(id: Uuid): Promise<void> {
    throw new Error('not implemented');
  }

  /** 2.3.1. */
  findByAccount(accountId: Uuid): Promise<SavedLocation[]> {
    // TODO
    throw new Error('not implemented');
  }

  /** 3.1.8 runs on every ingestion cycle. */
  findAllForExposureSweep(): Promise<SavedLocation[]> {
    // TODO
    throw new Error('not implemented');
  }

}
