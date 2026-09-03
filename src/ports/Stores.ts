/**
 * D-Fence — persistence contracts.
 * Layer: ports. Traces: 10.6.3 (every control class must be unit-testable), 1.1.x, 4.1.x.
 *
 * The control layer depends on these interfaces, never on the Postgres repositories, for the same
 * reason `ExternalGateway` exists: a scoring cycle must be runnable against an in-memory store in a
 * test and against PostGIS in production, without the control class knowing which it has. The
 * repositories in `persistence/` implement them; `persistence/memory/` implements them without a
 * database, which is what lets `npm run ingest` pull live NEA data before Supabase exists.
 */
import { Uuid } from '../entity/valueTypes';
import { SourceKind } from '../entity/enums';
import { Cluster } from '../entity/Cluster';
import { ClusterSnapshot } from '../entity/ClusterSnapshot';
import { IngestionRun } from '../entity/IngestionRun';
import { PriorityScore } from '../entity/PriorityScore';
import { ParsedBatch } from './types';

export interface ClusterStore {
  findById(id: Uuid): Promise<Cluster | null>;
  /** Clusters the feed still publishes (1.1.x). */
  findActive(): Promise<Cluster[]>;
  /** @returns the feature count written, for the IngestionRun (1.1.14). */
  upsertFromFeed(batch: ParsedBatch): Promise<number>;
  /** Append only. Snapshots are never overwritten: 1.1.8, 9.1.9 and 9.1.10 depend on history. */
  appendSnapshot(snapshot: ClusterSnapshot): Promise<void>;
  /** The previous snapshot for a cluster, or null the first time it is seen (1.1.6, 1.1.8). */
  latestSnapshot(objectId: string): Promise<ClusterSnapshot | null>;
}

export interface IngestionRunStore {
  recordStart(source: SourceKind, trigger: string): Promise<IngestionRun>;
  recordOutcome(run: IngestionRun, outcome: string, featureCount: number): Promise<IngestionRun>;
  /** 1.1.20 — the publisher stamp recorded at the last successful download, or null. */
  lastPublisherStamp(source: SourceKind): Promise<string | null>;
  savePublisherStamp(source: SourceKind, stamp: string): Promise<void>;
  /** 10.2.2 — mark the source stale without touching the data it already produced. */
  markStale(source: SourceKind): Promise<void>;
  recentRuns(source: SourceKind, limit: number): Promise<IngestionRun[]>;
}

export interface PriorityScoreStore {
  saveAll(scores: PriorityScore[]): Promise<void>;
  /** 4.1.11 — score history, newest first. */
  historyFor(clusterId: Uuid, limit: number): Promise<PriorityScore[]>;
  latest(): Promise<PriorityScore[]>;
}
