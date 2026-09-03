/**
 * D-Fence — ClusterIngestionJob.
 * Stereotype: <<control>>. Traces: 1.1.1–1.1.23.
 *
 * Turns the NEA GeoJSON into Clusters and append-only ClusterSnapshots, and classifies what changed.
 * The feed publishes **current values only** — no history, no deltas — so the comparison against the
 * previous snapshot is the only place change is knowable, and 1.1.8, 9.1.9 and 9.1.10 all rest on it.
 */
import { randomUUID } from 'node:crypto';
import { SourceKind, ChangeClass, Trajectory } from '../../entity/enums';
import { Cluster } from '../../entity/Cluster';
import { ClusterSnapshot } from '../../entity/ClusterSnapshot';
import { GeoPoint, Polygon, PremisesMix } from '../../entity/valueTypes';
import { ClusterStore, IngestionRunStore } from '../../ports/Stores';
import { ClusterSource } from '../../ports/ExternalGateway';
import { ParsedBatch, RawPayload } from '../../ports/types';
import { AbstractIngestionJob } from './AbstractIngestionJob';
import { ClusterFeedParser, RawClusterProperties } from './ClusterFeedParser';

interface GeoJsonFeature {
  properties?: RawClusterProperties;
  geometry?: { type?: string; coordinates?: unknown };
}

interface GeoJsonPayload {
  features?: GeoJsonFeature[];
}

export class ClusterIngestionJob extends AbstractIngestionJob {
  constructor(
    private readonly source: ClusterSource & { fetchLastUpdatedAt(): Promise<string | null> },
    runs: IngestionRunStore,
    private readonly clusters: ClusterStore,
  ) {
    super(source, runs);
  }

  /** Features rejected by 1.1.3 in the last parse, logged by 1.1.4 and reported to 1.4.x. */
  readonly rejected: Array<{ objectId: string | null; missingField: string }> = [];
  private publisherStamp: string | null = null;

  protected sourceKind(): SourceKind {
    return SourceKind.Clusters;
  }

  /**
   * 1.1.19, 1.1.20 — one cheap metadata call decides whether the 25 KB payload is worth fetching.
   * The stamp is held rather than saved here: saving before a successful parse would skip the next
   * cycle after a failed one, which is exactly when a retry is needed.
   */
  protected override async shouldRun(): Promise<boolean> {
    this.publisherStamp = await this.source.fetchLastUpdatedAt();
    const last = await this.runs.lastPublisherStamp(SourceKind.Clusters);
    return ClusterFeedParser.shouldDownload(this.publisherStamp, last);
  }

  protected fetch(): Promise<RawPayload> {
    return this.source.fetchClusters();
  }

  /**
   * 1.1.2, 1.1.3, 1.1.17 — parse every feature, reject the incomplete ones by name, and carry on
   * with the rest of the batch rather than failing the cycle.
   */
  protected async parse(raw: RawPayload): Promise<ParsedBatch> {
    this.rejected.length = 0;
    const payload = raw.body as GeoJsonPayload;
    const features = payload.features ?? [];
    const records: Cluster[] = [];

    for (const feature of features) {
      const geometryPresent = feature.geometry?.coordinates !== undefined;
      const result = ClusterFeedParser.parseFeature(feature.properties ?? {}, geometryPresent);
      if ('rejected' in result) {
        this.rejected.push(result.rejected);
        continue;
      }
      const parsed = result.accepted;
      const existing = await this.clusters.latestSnapshot(parsed.objectId);

      const cluster = new Cluster();
      cluster.objectId = parsed.objectId;
      cluster.locality = parsed.locality;
      cluster.caseSize = parsed.caseSize;
      cluster.boundary = ClusterIngestionJob.toPolygon(feature.geometry?.coordinates);
      cluster.premisesMix = new PremisesMix(
        parsed.homeHabitats,
        parsed.publicPlaceHabitats,
        parsed.constructionSiteHabitats,
      );
      cluster.caseDelta = existing === null ? 0 : parsed.caseSize - existing.caseSize;
      cluster.isActive = true;

      const snapshot = new ClusterSnapshot();
      snapshot.id = randomUUID();
      snapshot.retrievedAt = raw.retrievedAt;
      snapshot.caseSize = parsed.caseSize;
      snapshot.boundary = cluster.boundary;
      snapshot.fmelUpdD = parsed.feedUpdatedAt ?? '';

      cluster.changeClass = this.detectChange(existing, snapshot);
      cluster.trajectory = ClusterIngestionJob.toTrajectory(cluster.changeClass);
      records.push(cluster);
    }

    return { retrievedAt: raw.retrievedAt, records };
  }

  /** 1.1.5 — the snapshot is appended for every accepted feature, never overwritten. */
  protected async persist(batch: ParsedBatch): Promise<number> {
    const written = await this.clusters.upsertFromFeed(batch);
    for (const cluster of batch.records as Cluster[]) {
      const stored = await this.clusters.findById(cluster.id);
      const snapshot = new ClusterSnapshot();
      snapshot.id = randomUUID();
      snapshot.clusterId = (stored ?? cluster).id;
      snapshot.retrievedAt = batch.retrievedAt;
      snapshot.caseSize = cluster.caseSize;
      snapshot.boundary = cluster.boundary;
      snapshot.fmelUpdD = '';
      await this.clusters.appendSnapshot(snapshot);
    }
    return written;
  }

  /** 1.1.20 — record the publisher stamp only after the payload has been parsed and stored. */
  protected override async afterPersist(): Promise<void> {
    if (this.publisherStamp !== null) {
      await this.runs.savePublisherStamp(SourceKind.Clusters, this.publisherStamp);
    }
  }

  /**
   * 1.1.9 — NEW / GROWN / UNCHANGED / SHRUNK, by comparing the incoming snapshot with the last
   * stored one. CLOSED is not decided here: 1.1.10 defines it by *absence* from two consecutive
   * retrievals, which is a property of the batch, not of a feature that is present.
   */
  detectChange(previous: ClusterSnapshot | null, current: ClusterSnapshot): ChangeClass {
    if (previous === null) {
      return ChangeClass.NEW;
    }
    if (current.caseSize > previous.caseSize) {
      return ChangeClass.GROWN;
    }
    if (current.caseSize < previous.caseSize) {
      return ChangeClass.SHRUNK;
    }
    return ChangeClass.UNCHANGED;
  }

  private static toTrajectory(change: ChangeClass): Trajectory {
    switch (change) {
      case ChangeClass.GROWN:
        return Trajectory.Growing;
      case ChangeClass.SHRUNK:
        return Trajectory.Receding;
      default:
        return Trajectory.Stable;
    }
  }

  /**
   * GeoJSON gives `[longitude, latitude]`; GeoPoint takes `(latitude, longitude)`. Reversing them
   * puts every cluster in the Indian Ocean, which is precisely the argument-order bug GeoPoint was
   * introduced to prevent — so the swap happens here, once.
   */
  private static toPolygon(coordinates: unknown): Polygon {
    const rings = Array.isArray(coordinates) ? (coordinates as number[][][]) : [];
    return new Polygon(
      rings.map((ring) =>
        (Array.isArray(ring) ? ring : []).map(([lon, lat]) => new GeoPoint(Number(lat), Number(lon))),
      ),
    );
  }
}
