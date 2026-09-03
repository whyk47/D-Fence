/**
 * D-Fence — in-memory implementations of the persistence ports.
 * Stereotype: <<persistence>>. Traces: 10.2.3, 10.6.3, 1.1.5, 1.1.14, 4.1.11.
 *
 * **Why these exist.** The Postgres repositories need a Supabase project that does not exist yet,
 * and the ingestion and scoring paths need to run today so cluster history starts accumulating and
 * the design can be proved against live data. These implement the same ports, so swapping to
 * PostGIS later changes one line in AppConfigurator and nothing in the control layer — which is the
 * whole argument for having a ports layer, demonstrated rather than asserted.
 *
 * They are also what the Lab 4 tests run against: a scoring cycle with no network and no database.
 *
 * **What they deliberately do not do:** no spatial queries. `findContaining` and `findWithin` are
 * PostGIS operations (3.1.8, 5.1.7) and a hand-rolled point-in-polygon here would be a second
 * implementation of a predicate that must have exactly one — the risk `valueTypes.Polygon.contains`
 * already warns about.
 */
import { randomUUID } from 'node:crypto';
import { ClusterStore, IngestionRunStore, PriorityScoreStore } from '../../ports/Stores';
import { ParsedBatch } from '../../ports/types';
import { Uuid } from '../../entity/valueTypes';
import { SourceKind } from '../../entity/enums';
import { Cluster } from '../../entity/Cluster';
import { ClusterSnapshot } from '../../entity/ClusterSnapshot';
import { IngestionRun } from '../../entity/IngestionRun';
import { PriorityScore } from '../../entity/PriorityScore';

export class InMemoryClusterStore implements ClusterStore {
  private readonly clusters = new Map<Uuid, Cluster>();
  private readonly byObjectId = new Map<string, Uuid>();
  /** Append-only, per cluster. 1.1.5 forbids overwriting a snapshot. */
  private readonly snapshots = new Map<string, ClusterSnapshot[]>();

  async findById(id: Uuid): Promise<Cluster | null> {
    return this.clusters.get(id) ?? null;
  }

  async findActive(): Promise<Cluster[]> {
    return [...this.clusters.values()].filter((c) => c.isActive);
  }

  async findByObjectId(objectId: string): Promise<Cluster | null> {
    const id = this.byObjectId.get(objectId);
    return id === undefined ? null : (this.clusters.get(id) ?? null);
  }

  /**
   * 1.1.5–1.1.7 — upsert by the feed's OBJECTID, preserving first-seen, and only moving
   * last-updated when something actually differs (1.1.7).
   */
  async upsertFromFeed(batch: ParsedBatch): Promise<number> {
    let written = 0;
    for (const record of batch.records as Cluster[]) {
      const existingId = this.byObjectId.get(record.objectId);
      if (existingId === undefined) {
        record.id = record.id || randomUUID();
        record.firstSeenAt = record.firstSeenAt ?? batch.retrievedAt;
        record.lastUpdatedAt = batch.retrievedAt;
        this.clusters.set(record.id, record);
        this.byObjectId.set(record.objectId, record.id);
      } else {
        const existing = this.clusters.get(existingId) as Cluster;
        record.id = existingId;
        record.firstSeenAt = existing.firstSeenAt;
        record.lastUpdatedAt = existing.caseSize === record.caseSize ? existing.lastUpdatedAt : batch.retrievedAt;
        this.clusters.set(existingId, record);
      }
      written += 1;
    }
    return written;
  }

  /** 1.1.10 — absent from two consecutive retrievals means CLOSED, so absence is recorded here. */
  async deactivateAbsent(objectIdsSeen: Set<string>): Promise<string[]> {
    const closed: string[] = [];
    for (const cluster of this.clusters.values()) {
      if (cluster.isActive && !objectIdsSeen.has(cluster.objectId)) {
        cluster.isActive = false;
        closed.push(cluster.objectId);
      }
    }
    return closed;
  }

  async appendSnapshot(snapshot: ClusterSnapshot): Promise<void> {
    const key = snapshot.clusterId;
    const list = this.snapshots.get(key) ?? [];
    list.push(snapshot);
    this.snapshots.set(key, list);
  }

  async latestSnapshot(objectId: string): Promise<ClusterSnapshot | null> {
    const cluster = await this.findByObjectId(objectId);
    if (cluster === null) {
      return null;
    }
    const list = this.snapshots.get(cluster.id) ?? [];
    return list.length === 0 ? null : (list[list.length - 1] as ClusterSnapshot);
  }

  async snapshotsFor(clusterId: Uuid): Promise<ClusterSnapshot[]> {
    return [...(this.snapshots.get(clusterId) ?? [])];
  }
}

export class InMemoryIngestionRunStore implements IngestionRunStore {
  private readonly runs: IngestionRun[] = [];
  private readonly stamps = new Map<SourceKind, string>();
  private readonly stale = new Set<SourceKind>();

  async recordStart(source: SourceKind, trigger: string): Promise<IngestionRun> {
    const run = new IngestionRun();
    run.id = randomUUID();
    run.source = source;
    run.startedAt = new Date();
    run.endedAt = null;
    run.featureCount = 0;
    run.outcome = 'RUNNING';
    run.trigger = trigger;
    this.runs.push(run);
    return run;
  }

  async recordOutcome(run: IngestionRun, outcome: string, featureCount: number): Promise<IngestionRun> {
    run.endedAt = new Date();
    run.outcome = outcome;
    run.featureCount = featureCount;
    if (outcome !== 'FAILED') {
      this.stale.delete(run.source);
    }
    return run;
  }

  async lastPublisherStamp(source: SourceKind): Promise<string | null> {
    return this.stamps.get(source) ?? null;
  }

  async savePublisherStamp(source: SourceKind, stamp: string): Promise<void> {
    this.stamps.set(source, stamp);
  }

  async markStale(source: SourceKind): Promise<void> {
    this.stale.add(source);
  }

  isStale(source: SourceKind): boolean {
    return this.stale.has(source);
  }

  async recentRuns(source: SourceKind, limit: number): Promise<IngestionRun[]> {
    return this.runs
      .filter((r) => r.source === source)
      .slice(-Math.max(0, limit))
      .reverse();
  }
}

export class InMemoryPriorityScoreStore implements PriorityScoreStore {
  /**
   * Scores kept **by cycle**, not as one flat list ordered by `computedAt`.
   *
   * The first version grouped the latest cycle by timestamp equality, and a test caught it: two
   * cycles that run inside the same millisecond share a `computedAt`, so `latest()` returned both
   * and the dashboard would have shown every cluster twice. Time is not a cycle identifier — it is
   * merely usually distinct. **The Postgres implementation must key on a cycle id for the same
   * reason**, not on `MAX(computed_at)`.
   */
  private readonly cycles: PriorityScore[][] = [];

  async saveAll(scores: PriorityScore[]): Promise<void> {
    // 4.1.11 keeps every cycle, so this appends a cycle rather than replacing the last one.
    this.cycles.push([...scores]);
  }

  async historyFor(clusterId: Uuid, limit: number): Promise<PriorityScore[]> {
    const forCluster: PriorityScore[] = [];
    for (let i = this.cycles.length - 1; i >= 0 && forCluster.length < limit; i -= 1) {
      forCluster.push(...(this.cycles[i] as PriorityScore[]).filter((s) => s.clusterId === clusterId));
    }
    return forCluster.slice(0, Math.max(0, limit));
  }

  async latest(): Promise<PriorityScore[]> {
    return this.cycles.length === 0 ? [] : [...(this.cycles[this.cycles.length - 1] as PriorityScore[])];
  }

  cycleCount(): number {
    return this.cycles.length;
  }
}
