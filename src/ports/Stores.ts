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
import { WorkOrder } from '../entity/WorkOrder';
import { CompletionEvidence } from '../entity/CompletionEvidence';
import { TreatmentRecord } from '../entity/TreatmentRecord';
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

export interface WorkOrderStore {
  findById(id: Uuid): Promise<WorkOrder | null>;
  save(workOrder: WorkOrder): Promise<WorkOrder>;
  /** 8.1.11 — an open work order of the same task type on the same cluster blocks a second one. */
  findOpenForCluster(clusterId: Uuid): Promise<WorkOrder[]>;
  /** 8.4.1 — a crew member sees only what is assigned to them. */
  findForAssignee(assigneeId: Uuid): Promise<WorkOrder[]>;
  findAllOpen(): Promise<WorkOrder[]>;
  /** 8.2.7 — every previous assignee is retained. */
  appendAssignmentHistory(workOrderId: Uuid, assigneeId: Uuid | null, at: Date): Promise<void>;
  assignmentHistory(workOrderId: Uuid): Promise<Array<{ assigneeId: Uuid | null; at: Date }>>;
  /** The evidence attached to the current completion attempt (8.3.6, 8.3.10). */
  saveEvidence(evidence: CompletionEvidence): Promise<void>;
  latestEvidence(workOrderId: Uuid): Promise<CompletionEvidence | null>;
}

export interface TreatmentRecordStore {
  /** 8.3.12 — written when a work order is Verified; it is what moves 4.1.15's driver. */
  save(record: TreatmentRecord): Promise<TreatmentRecord>;
  latestForCluster(clusterId: Uuid): Promise<TreatmentRecord | null>;
  allForCluster(clusterId: Uuid): Promise<TreatmentRecord[]>;
}

/**
 * 8.2.4, 8.3.11, 8.5.2. A port rather than the Telegram gateway directly, so the lifecycle can be
 * tested for "was the assignee notified" without a bot token, and so a second channel (email, in-app)
 * is an implementation rather than a change to the controller.
 */
export interface Notifier {
  notify(accountId: Uuid, message: string): Promise<void>;
}

/** 8.5.3 — a verified work order must be reflected in the next scoring cycle. */
export interface Rescorer {
  rescoreCluster(clusterId: Uuid): Promise<void>;
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
