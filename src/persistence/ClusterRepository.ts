/**
 * D-Fence — ClusterRepository.
 * Stereotype: <<persistence>>. Traces: 1.1.x, 1.2.5, 3.1.8, 5.1.7
 */
import { Repository } from '../ports/Repository';
import { Database } from './Database';
import { Cluster, Uuid, GeoPoint, SourceKind, WorkOrderStatus, ClusterSnapshot, SourceHealth } from '../entity';
import { ParsedBatch } from '../ports/types';

export class ClusterRepository implements Repository<Cluster> {
  constructor(private readonly db: Database) {}

  findById(id: Uuid): Promise<Cluster | null> {
    throw new Error('not implemented');
  }

  save(entity: Cluster): Promise<Cluster> {
    throw new Error('not implemented');
  }

  delete(id: Uuid): Promise<void> {
    throw new Error('not implemented');
  }

  /** Clusters the feed still publishes (1.1.x). */
  findActive(): Promise<Cluster[]> {
    // TODO
    throw new Error('not implemented');
  }

  /** PostGIS ST_Contains. Authoritative answer for 3.1.8 and 5.1.7 — not Polygon.contains(). */
  findContaining(p: GeoPoint): Promise<Cluster | null> {
    // TODO
    throw new Error('not implemented');
  }

  /** PostGIS ST_DWithin. 3.1.8's 150 m band. */
  findWithin(p: GeoPoint, metres: number): Promise<Cluster[]> {
    // TODO
    throw new Error('not implemented');
  }

  /** Returns the feature count for IngestionRun. */
  upsertFromFeed(batch: ParsedBatch): Promise<number> {
    // TODO
    throw new Error('not implemented');
  }

  /** Append only. Snapshots are never overwritten: 1.1.8, 9.1.9 and 9.1.10 all depend on history. */
  appendSnapshot(s: ClusterSnapshot): Promise<void> {
    // TODO
    throw new Error('not implemented');
  }

}
