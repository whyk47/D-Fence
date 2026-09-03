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
import { Uuid, GeoPoint } from '../entity/valueTypes';
import { AlertTrigger, ReportStatus, ReportType, Role, SourceKind } from '../entity/enums';
import { Cluster } from '../entity/Cluster';
import { ClusterSnapshot } from '../entity/ClusterSnapshot';
import { IngestionRun } from '../entity/IngestionRun';
import { PriorityScore } from '../entity/PriorityScore';
import { WorkOrder } from '../entity/WorkOrder';
import { CompletionEvidence } from '../entity/CompletionEvidence';
import { Report } from '../entity/Report';
import { ReportPhoto } from '../entity/ReportPhoto';
import { Corroboration } from '../entity/Corroboration';
import { Account } from '../entity/Account';
import { Session } from '../entity/Session';
import { SavedLocation } from '../entity/SavedLocation';
import { Alert } from '../entity/Alert';
import { AlertSubscription } from '../entity/AlertSubscription';
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

/**
 * The report aggregate: the report, its photographs, its corroborations and its status history.
 *
 * One port rather than four, because they are one aggregate — a photograph has no meaning without
 * its report, and every write here is made in the same transaction by the same controller. Splitting
 * them would give four objects that can only ever be used together, which is the cost of a fat
 * interface without the benefit of a narrow one.
 *
 * Traces: 5.1.1–5.1.14, 5.2.1–5.2.9, 5.3.1–5.3.5, 4.1.3.
 */
export interface ReportStore {
  findById(id: Uuid): Promise<Report | null>;
  save(report: Report): Promise<Report>;
  /**
   * 5.1.11 — open reports of the same type within `radiusMetres` of the point, submitted at or
   * after `since`. The radius test belongs to the store because PostGIS answers it with an index;
   * the in-memory implementation walks the list, and both must give the same answer at 50 m.
   */
  findNearbyOpen(point: GeoPoint, type: ReportType, radiusMetres: number, since: Date): Promise<Report[]>;
  /** 5.3.1 — the moderation queue. */
  findByStatus(status: ReportStatus): Promise<Report[]>;
  /** 2.3.2, 5.2.9 — a Resident's own reports. */
  findByReporter(reporterId: Uuid): Promise<Report[]>;
  /** 5.2.5 into 4.1.3 — the verified open report count, per cluster, in one query per cycle. */
  verifiedOpenCountByCluster(): Promise<Map<Uuid, number>>;
  /** 8.5.1, 8.3.21 — every report linked to a work order. */
  findForWorkOrder(workOrderId: Uuid): Promise<Report[]>;
  /**
   * Append-only. 8.3.21 needs the status a report held *before* it was Actioned, and a single
   * `previousStatus` column would be wrong the moment a report is actioned twice.
   */
  appendStatusChange(reportId: Uuid, from: ReportStatus | null, to: ReportStatus, at: Date): Promise<void>;
  statusHistory(reportId: Uuid): Promise<Array<{ from: ReportStatus | null; to: ReportStatus; at: Date }>>;
  /** 5.1.13, 5.1.14 */
  saveCorroboration(corroboration: Corroboration): Promise<void>;
  hasCorroborated(reportId: Uuid, accountId: Uuid): Promise<boolean>;
  /** 5.1.5, 5.3.5 */
  savePhoto(photo: ReportPhoto): Promise<void>;
  photosFor(reportId: Uuid): Promise<ReportPhoto[]>;
}

/**
 * Where a point is, spatially. 5.1.7 and 5.1.8 are PostGIS questions in production and arithmetic
 * in a test, and this is the seam between the two.
 *
 * It is a port of its own, not two more methods on `ClusterStore`, because of the warning in
 * `valueTypes.Polygon.contains`: containment must have exactly ONE implementation answering it at
 * a time. A port with one bound implementation per deployment is precisely that guarantee, whereas
 * a `contains()` on the value type plus a query in the store is two answers that can disagree.
 */
export interface ClusterLocator {
  /** 5.1.7 — the active cluster whose boundary contains the point, or null. */
  containing(point: GeoPoint): Promise<Cluster | null>;
  /**
   * 3.1.9, 5.1.8 — the nearest active cluster within the radius, with the distance **to its
   * boundary** rather than to its centroid, or null when none is that close.
   *
   * Boundary distance is the point for 3.1.9's 150 m band: a cluster three hundred metres across
   * would put addresses just outside its edge half a kilometre away if measured from the centre,
   * so the band would mean something different for every cluster. A point inside is at distance 0.
   */
  nearestWithin(point: GeoPoint, radiusMetres: number): Promise<{ cluster: Cluster; distanceMetres: number } | null>;
}

/**
 * What §8 owes §5. Work orders were built before reports existed, and three requirements
 * (5.2.6, 5.2.7 / 8.5.1 and 8.3.21) join them.
 *
 * An interface rather than a direct call, so `DispatchController` and
 * `WorkOrderLifecycleController` do not depend on the report controllers — the dependency runs one
 * way, into this port, and the §8 tests still construct without a report store.
 */
export interface ReportLinkage {
  /** 5.2.6 — the linked work order has been assigned. */
  onWorkOrderAssigned(workOrderId: Uuid): Promise<void>;
  /** 5.2.7, 8.5.1, 8.5.2 — the linked work order has been verified complete. */
  onWorkOrderVerified(workOrderId: Uuid): Promise<void>;
  /** 8.3.21 — the linked work order was cancelled; reports return to their prior status. */
  onWorkOrderCancelled(workOrderId: Uuid): Promise<void>;
}

export interface AccountStore {
  findById(id: Uuid): Promise<Account | null>;
  /** 2.1.4 - the duplicate-registration check, and the lookup sign-in starts from. */
  findByEmail(email: string): Promise<Account | null>;
  findByAuthUserId(authUserId: string): Promise<Account | null>;
  save(account: Account): Promise<Account>;
  /** 2.2.3, 2.2.4 - the staff list a manager provisions from. */
  findByRole(role: Role): Promise<Account[]>;
}

/**
 * 2.1.8, 2.1.9, 2.1.12. Ours rather than the provider's, because 2.1.9 is an inactivity timeout
 * measured against **our** requests - see the note on the `Session` entity.
 */
export interface SessionStore {
  findByToken(token: string): Promise<Session | null>;
  save(session: Session): Promise<Session>;
  /** 2.2.4 - deactivating an account must not leave a live session behind it. */
  terminateAllFor(accountId: Uuid, at: Date): Promise<number>;
}

/**
 * 3.1.1-3.1.12. A resident's saved locations.
 */
export interface SavedLocationStore {
  findById(id: Uuid): Promise<SavedLocation | null>;
  /** 2.3.1, 3.1.1 — a resident's own, and the list the five-location limit is counted from. */
  findForAccount(accountId: Uuid): Promise<SavedLocation[]>;
  save(location: SavedLocation): Promise<SavedLocation>;
  delete(id: Uuid): Promise<void>;
  /** 3.1.8 — every location, re-evaluated on each cluster ingestion cycle. */
  all(): Promise<SavedLocation[]>;
}

/**
 * 3.1.12, 6.1.1, 6.1.3, 6.1.4. One subscription per saved location.
 *
 * Declared for 3.1.12's cascade before §6 existed, and widened here rather than replaced — which
 * is what the cascade being real code from the start bought.
 */
export interface AlertSubscriptionStore {
  findForLocation(locationId: Uuid): Promise<AlertSubscription | null>;
  save(subscription: AlertSubscription): Promise<AlertSubscription>;
  /** 3.1.12. @returns how many were removed, which the confirmation states. */
  deleteForLocation(locationId: Uuid): Promise<number>;
}

/** 6.1.9, 6.1.10, 6.1.11 — the alert log, which is also what the daily cap is read from. */
export interface AlertStore {
  findById(id: Uuid): Promise<Alert | null>;
  save(alert: Alert): Promise<Alert>;
  /** 6.1.9 — alerts for this location and trigger since a cut-off. */
  recentFor(locationId: Uuid, trigger: AlertTrigger, since: Date): Promise<Alert[]>;
  /** 6.1.10 — the delivery log, newest first. */
  recent(limit: number): Promise<Alert[]>;
}

/**
 * Rainfall accumulated at an arbitrary point. The scoring cycle asks this for cluster centroids;
 * a resident's saved location asks the same question about a different point.
 */
export interface RainfallReadingSource {
  forPoint(point: GeoPoint, now: Date): Promise<{ accum24hMm: number; accum72hMm: number } | null>;
}

export interface AuditStore {
  /** 2.3.8 — every refusal is logged, and the log is the only path a refusal can take. */
  appendDenial(accountId: Uuid, action: string, targetEntity: string, targetId: Uuid | null): Promise<void>;
  /**
   * 2.4.1 — every operation that changes stored state, with actor, action, target and time.
   * Distinct from `appendDenial`: a refusal changed nothing, and the two must be tellable apart
   * when the log is read.
   */
  appendAction(accountId: Uuid, action: string, targetEntity: string, targetId: Uuid | null): Promise<void>;
  /** 2.4.x — the audit trail, newest first. */
  recent(limit: number): Promise<Array<{ accountId: Uuid; action: string; targetEntity: string; occurredAt: Date }>>;
}

export interface PriorityScoreStore {
  saveAll(scores: PriorityScore[]): Promise<void>;
  /** 4.1.11 — score history, newest first. */
  historyFor(clusterId: Uuid, limit: number): Promise<PriorityScore[]>;
  latest(): Promise<PriorityScore[]>;
}
