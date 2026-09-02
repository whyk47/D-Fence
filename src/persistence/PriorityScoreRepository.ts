/**
 * D-Fence — PriorityScoreRepository.
 * Stereotype: <<persistence>>. Traces: 4.1.x, 9.1.9
 */
import { Repository } from '../ports/Repository';
import { Database } from './Database';
import { PriorityScore, Uuid, GeoPoint, SourceKind, WorkOrderStatus, ClusterSnapshot, SourceHealth } from '../entity';

export class PriorityScoreRepository implements Repository<PriorityScore> {
  constructor(private readonly db: Database) {}

  findById(id: Uuid): Promise<PriorityScore | null> {
    throw new Error('not implemented');
  }

  save(entity: PriorityScore): Promise<PriorityScore> {
    throw new Error('not implemented');
  }

  delete(id: Uuid): Promise<void> {
    throw new Error('not implemented');
  }

  findLatestForAll(): Promise<PriorityScore[]> {
    // TODO
    throw new Error('not implemented');
  }

  /** Scores are appended, never updated, so a demo score can be explained afterwards. */
  findHistory(clusterId: Uuid, days: number): Promise<PriorityScore[]> {
    // TODO
    throw new Error('not implemented');
  }

}
