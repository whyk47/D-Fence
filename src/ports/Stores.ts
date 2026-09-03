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
import { ParsedReading, ParsedStation } from '../control/ingestion/RainfallFeedParser';

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

export interface RainfallStore {
  /** Idempotent: the station list arrives with every readings payload (1.2.2). */
  saveStations(stations: ParsedStation[]): Promise<void>;
  stations(): Promise<ParsedStation[]>;
  /** @returns the number of readings newly stored; duplicates from an overlapping page are ignored. */
  saveReadings(readings: ParsedReading[]): Promise<number>;
  /** Readings within the window, for the 1.2.7 and 1.2.8 accumulations. */
  readingsSince(since: Date): Promise<ParsedReading[]>;
  /** 1.2.10 — the newest reading held, or null when nothing has ever been stored. */
  newestReadingAt(): Promise<Date | null>;
}

export interface AuditStore {
  /** 2.3.8 — every refusal is logged, and the log is the only path a refusal can take. */
  appendDenial(accountId: Uuid, action: string, targetEntity: string, targetId: Uuid | null): Promise<void>;
  /** 2.4.x — the audit trail, newest first. */
  recent(limit: number): Promise<Array<{ accountId: Uuid; action: string; targetEntity: string; occurredAt: Date }>>;
}

export interface PriorityScoreStore {
  saveAll(scores: PriorityScore[]): Promise<void>;
  /** 4.1.11 — score history, newest first. */
  historyFor(clusterId: Uuid, limit: number): Promise<PriorityScore[]>;
  latest(): Promise<PriorityScore[]>;
}
