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
 * **Spatial queries live behind their own port.** Containment (3.1.8, 5.1.7) is not a method on
 * `ClusterStore` here: it is `ClusterLocator`, implemented for development and test by
 * `InMemoryClusterLocator` and for production by PostGIS. Exactly one implementation is bound per
 * process, which is what the warning on `valueTypes.Polygon.contains` actually requires — one
 * answer to containment, not none in memory.
 */
import { randomUUID } from 'node:crypto';
import {
  AuditStore,
  ClusterStore,
  ForecastDerivation,
  ForecastStore,
  IngestionRunStore,
  PriorityScoreStore,
  RainfallStore,
} from '../../ports/Stores';
import { ParsedReading, ParsedStation } from '../../control/ingestion/RainfallFeedParser';
import { ParsedBatch } from '../../ports/types';
import { Uuid } from '../../entity/valueTypes';
import { ForecastRegion, SourceKind } from '../../entity/enums';
import { Cluster } from '../../entity/Cluster';
import { ClusterSnapshot } from '../../entity/ClusterSnapshot';
import { IngestionRun } from '../../entity/IngestionRun';
import { RegionForecast } from '../../entity/RegionForecast';
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

  /** 9.1.9, 9.1.10 — inclusive of the cut-off, so a 30-day window contains thirty days. */
  async snapshotsSince(clusterId: Uuid, since: Date): Promise<ClusterSnapshot[]> {
    return (this.snapshots.get(clusterId) ?? []).filter((s) => s.retrievedAt.getTime() >= since.getTime());
  }

  /** 1.3.2–1.3.5. Silently ignores an unknown id: a cluster closed between the forecast fetch and
   *  the write-back is not an error, it is the feed doing what 1.1.10 says it does. */
  async saveForecastDerivation(clusterId: Uuid, derivation: ForecastDerivation): Promise<void> {
    const cluster = this.clusters.get(clusterId);
    if (cluster === undefined) {
      return;
    }
    cluster.forecastRegion = derivation.region;
    cluster.heavyRainExpected = derivation.heavyRainExpected;
    cluster.forecastValidFrom = derivation.validFrom;
    cluster.forecastValidTo = derivation.validTo;
  }
}

/**
 * The stored 24-hour forecasts, newest retrieval per region.
 *
 * History is kept rather than overwritten — five rows every six hours is twenty rows a day — so
 * that "why was this cluster flagged yesterday" has an answer, which is what 1.3.5 is for.
 */
export class InMemoryForecastStore implements ForecastStore {
  private readonly forecasts: RegionForecast[] = [];

  async saveAll(forecasts: RegionForecast[]): Promise<number> {
    this.forecasts.push(...forecasts);
    return forecasts.length;
  }

  async latest(): Promise<RegionForecast[]> {
    const newest = new Map<ForecastRegion, RegionForecast>();
    for (const forecast of this.forecasts) {
      const held = newest.get(forecast.region);
      if (held === undefined || forecast.retrievedAt.getTime() >= held.retrievedAt.getTime()) {
        newest.set(forecast.region, forecast);
      }
    }
    return [...newest.values()];
  }

  async latestFor(region: ForecastRegion): Promise<RegionForecast | null> {
    return (await this.latest()).find((f) => f.region === region) ?? null;
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

export class InMemoryRainfallStore implements RainfallStore {
  private readonly stationsById = new Map<string, ParsedStation>();
  /** Keyed by station and timestamp so an overlapping backfill page cannot double-count a reading
   *  into the accumulation — which would silently inflate a scoring driver. */
  private readonly readings = new Map<string, ParsedReading>();

  /** 72 hours plus a margin. Nothing older can affect 1.2.8, and an unbounded map is a leak in a
   *  process meant to run for weeks. */
  constructor(private readonly retentionHours = 80) {}

  async saveStations(stations: ParsedStation[]): Promise<void> {
    for (const station of stations) {
      this.stationsById.set(station.stationId, station);
    }
  }

  async stations(): Promise<ParsedStation[]> {
    return [...this.stationsById.values()];
  }

  async saveReadings(readings: ParsedReading[]): Promise<number> {
    let written = 0;
    for (const reading of readings) {
      const key = `${reading.stationId}@${reading.readingAt.getTime()}`;
      if (!this.readings.has(key)) {
        this.readings.set(key, reading);
        written += 1;
      }
    }
    this.prune();
    return written;
  }

  async readingsSince(since: Date): Promise<ParsedReading[]> {
    return [...this.readings.values()].filter((r) => r.readingAt.getTime() >= since.getTime());
  }

  async newestReadingAt(): Promise<Date | null> {
    if (this.readings.size === 0) {
      return null;
    }
    return new Date(Math.max(...[...this.readings.values()].map((r) => r.readingAt.getTime())));
  }

  size(): number {
    return this.readings.size;
  }

  private prune(): void {
    const floor = Date.now() - this.retentionHours * 3_600_000;
    for (const [key, reading] of this.readings) {
      if (reading.readingAt.getTime() < floor) {
        this.readings.delete(key);
      }
    }
  }
}

export class InMemoryAuditStore implements AuditStore {
  private readonly records: Array<{ accountId: Uuid; action: string; targetEntity: string; occurredAt: Date }> = [];

  async appendDenial(accountId: Uuid, action: string, targetEntity: string, _targetId: Uuid | null): Promise<void> {
    this.records.push({ accountId, action: `DENIED:${action}`, targetEntity, occurredAt: new Date() });
  }

  /**
   * 2.4.1. Prefixed so a refusal and a state change are distinguishable when the log is read —
   * they mean opposite things, and an unprefixed list of action names cannot tell them apart.
   *
   * 2.4.2 says an audit record may not be modified or deleted by any role. Here that is the array
   * being append-only and `recent()` returning a copy; in Postgres it is a table with no UPDATE or
   * DELETE grant, which is where the real guarantee has to live.
   */
  async appendAction(accountId: Uuid, action: string, targetEntity: string, _targetId: Uuid | null): Promise<void> {
    this.records.push({ accountId, action, targetEntity, occurredAt: new Date() });
  }

  async recent(limit: number): Promise<Array<{ accountId: Uuid; action: string; targetEntity: string; occurredAt: Date }>> {
    return this.records.slice(-Math.max(0, limit)).reverse();
  }

  size(): number {
    return this.records.length;
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
