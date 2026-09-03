/**
 * D-Fence — in-memory report persistence and spatial lookup.
 * Stereotype: <<persistence>>. Traces: 5.1.7–5.1.11, 5.2.5, 8.3.21, 10.6.3.
 *
 * Same argument as the other two in-memory stores: reports have to be submittable and moderatable
 * before Supabase exists, and the Lab 4 boundary-value cases for 5.1.11 need a store that can be
 * driven to 49 and 51 metres without a database.
 */
import { randomUUID } from 'node:crypto';
import { ClusterLocator, ReportStore } from '../../ports/Stores';
import { GeoPoint, Uuid } from '../../entity/valueTypes';
import { ReportStatus, ReportType } from '../../entity/enums';
import { Report } from '../../entity/Report';
import { ReportPhoto } from '../../entity/ReportPhoto';
import { Corroboration } from '../../entity/Corroboration';
import { Cluster } from '../../entity/Cluster';
import { InMemoryClusterStore } from './InMemoryStores';

export class InMemoryReportStore implements ReportStore {
  private readonly reports = new Map<Uuid, Report>();
  private readonly photos = new Map<Uuid, ReportPhoto[]>();
  private readonly corroborations: Corroboration[] = [];
  private readonly history = new Map<Uuid, Array<{ from: ReportStatus | null; to: ReportStatus; at: Date }>>();

  async findById(id: Uuid): Promise<Report | null> {
    return this.reports.get(id) ?? null;
  }

  async save(report: Report): Promise<Report> {
    report.id = report.id || randomUUID();
    this.reports.set(report.id, report);
    return report;
  }

  /**
   * 5.1.11. The comparison is `<=` on the radius and `>=` on the timestamp, deliberately: 50 metres
   * and 24 hours are stated as the duplicate condition, so a report exactly at the boundary is a
   * duplicate. The Lab 4 cases at 49, 50 and 51 metres pin that choice down.
   */
  async findNearbyOpen(point: GeoPoint, type: ReportType, radiusMetres: number, since: Date): Promise<Report[]> {
    return [...this.reports.values()].filter(
      (r) =>
        r.type === type &&
        r.isOpen() &&
        r.submittedAt.getTime() >= since.getTime() &&
        point.distanceTo(r.point) <= radiusMetres,
    );
  }

  /** 7.3.5 — inclusive of the cut-off, matching every other window in the system. */
  async submittedSince(since: Date): Promise<Report[]> {
    return [...this.reports.values()]
      .filter((r) => r.submittedAt.getTime() >= since.getTime())
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  }

  async findByStatus(status: ReportStatus): Promise<Report[]> {
    return [...this.reports.values()].filter((r) => r.currentStatus() === status);
  }

  async findByReporter(reporterId: Uuid): Promise<Report[]> {
    return [...this.reports.values()].filter((r) => r.reporterId === reporterId);
  }

  /** 5.2.5 — Verified and Actioned only, and only where a cluster binding exists (5.1.9). */
  async verifiedOpenCountByCluster(): Promise<Map<Uuid, number>> {
    const counts = new Map<Uuid, number>();
    for (const report of this.reports.values()) {
      if (!report.isVerified() || report.clusterId === null) {
        continue;
      }
      counts.set(report.clusterId, (counts.get(report.clusterId) ?? 0) + 1);
    }
    return counts;
  }

  async findForWorkOrder(workOrderId: Uuid): Promise<Report[]> {
    return [...this.reports.values()].filter((r) => r.workOrderId === workOrderId);
  }

  async appendStatusChange(reportId: Uuid, from: ReportStatus | null, to: ReportStatus, at: Date): Promise<void> {
    const list = this.history.get(reportId) ?? [];
    list.push({ from, to, at });
    this.history.set(reportId, list);
  }

  async statusHistory(reportId: Uuid): Promise<Array<{ from: ReportStatus | null; to: ReportStatus; at: Date }>> {
    return [...(this.history.get(reportId) ?? [])];
  }

  async saveCorroboration(corroboration: Corroboration): Promise<void> {
    corroboration.id = corroboration.id || randomUUID();
    this.corroborations.push(corroboration);
  }

  async hasCorroborated(reportId: Uuid, accountId: Uuid): Promise<boolean> {
    return this.corroborations.some((c) => c.reportId === reportId && c.accountId === accountId);
  }

  async savePhoto(photo: ReportPhoto): Promise<void> {
    photo.id = photo.id || randomUUID();
    const list = this.photos.get(photo.reportId) ?? [];
    list.push(photo);
    this.photos.set(photo.reportId, list);
  }

  async photosFor(reportId: Uuid): Promise<ReportPhoto[]> {
    return [...(this.photos.get(reportId) ?? [])];
  }

  /** Test and dev convenience; not part of the port. */
  all(): Report[] {
    return [...this.reports.values()];
  }
}

/**
 * Point-in-polygon and nearest-locality without PostGIS.
 *
 * `InMemoryStores.ts` refuses spatial queries on the grounds that containment must have exactly one
 * implementation. That still holds, and this does not break it: containment is answered by the
 * `ClusterLocator` **port**, and exactly one implementation of it is bound in a given process — this
 * one in development and in the Lab 4 tests, the PostGIS one in production. What the warning
 * forbids is `Polygon.contains` answering it *as well*, from the client, for a stored binding.
 * That method is still unimplemented and stays that way.
 */
export class InMemoryClusterLocator implements ClusterLocator {
  constructor(private readonly clusters: InMemoryClusterStore) {}

  /** 5.1.7 — the first active cluster whose outer ring contains the point. */
  async containing(point: GeoPoint): Promise<Cluster | null> {
    for (const cluster of await this.clusters.findActive()) {
      const ring = cluster.boundary?.rings[0];
      if (ring !== undefined && InMemoryClusterLocator.ringContains(ring, point)) {
        return cluster;
      }
    }
    return null;
  }

  /**
   * 3.1.9, 5.1.8 — the nearest active cluster within the radius, measured **to its boundary**.
   *
   * Boundary distance, not centroid distance, and the difference is the requirement: NEA's
   * clusters run to several hundred metres across, so a home just outside the edge of a large one
   * is metres away by boundary and half a kilometre away by centre. With centroid distance the
   * 150 m band in 3.1.9 would mean something different for every cluster, depending on its size.
   */
  async nearestWithin(
    point: GeoPoint,
    radiusMetres: number,
  ): Promise<{ cluster: Cluster; distanceMetres: number } | null> {
    let best: { cluster: Cluster; distanceMetres: number } | null = null;
    for (const cluster of await this.clusters.findActive()) {
      const ring = cluster.boundary?.rings[0];
      if (ring === undefined || ring.length === 0) {
        continue;
      }
      const distance = InMemoryClusterLocator.ringContains(ring, point)
        ? 0 // inside the boundary: 3.1.9's IN_CLUSTER, and no distance to speak of
        : InMemoryClusterLocator.distanceToRing(ring, point);
      if (distance <= radiusMetres && (best === null || distance < best.distanceMetres)) {
        best = { cluster, distanceMetres: distance };
      }
    }
    return best;
  }

  /**
   * Shortest distance from a point to any edge of the ring, in metres.
   *
   * Latitude and longitude are projected onto a local plane first — a degree of longitude is only
   * about 0.9998 of a degree of latitude in length at one degree north, but the two axes are not
   * interchangeable in general and treating them as such would skew every distance by the cosine
   * of the latitude. Over Singapore the correction is small and it is still cheaper to apply than
   * to explain away.
   */
  private static distanceToRing(ring: GeoPoint[], p: GeoPoint): number {
    const metresPerDegreeLat = 111_320;
    const metresPerDegreeLon = metresPerDegreeLat * Math.cos((p.latitude * Math.PI) / 180);
    const toXY = (g: GeoPoint): { x: number; y: number } => ({
      x: (g.longitude - p.longitude) * metresPerDegreeLon,
      y: (g.latitude - p.latitude) * metresPerDegreeLat,
    });

    let shortest = Number.POSITIVE_INFINITY;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const a = toXY(ring[i] as GeoPoint);
      const b = toXY(ring[j] as GeoPoint);
      shortest = Math.min(shortest, InMemoryClusterLocator.pointToSegment(a, b));
    }
    return shortest;
  }

  /** Distance from the origin to the segment ab, both already in local metres. */
  private static pointToSegment(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
      return Math.hypot(a.x, a.y); // a degenerate edge is a point
    }
    // Projection of the origin onto the line, clamped to the segment.
    const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared));
    return Math.hypot(a.x + t * dx, a.y + t * dy);
  }

  /**
   * Ray casting on the outer ring, in degrees.
   *
   * Treating latitude and longitude as planar coordinates is wrong in general and immaterial here:
   * a dengue cluster boundary is a few hundred metres across at one degree north, where the
   * distortion between the two axes is under a hundredth of a percent. Stated because it is a
   * simplification made knowingly — the PostGIS implementation does it properly on the geography
   * type, and this one exists so the rule can be tested without a database.
   */
  private static ringContains(ring: GeoPoint[], p: GeoPoint): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const a = ring[i] as GeoPoint;
      const b = ring[j] as GeoPoint;
      const straddles = a.latitude > p.latitude !== b.latitude > p.latitude;
      if (!straddles) {
        continue;
      }
      const crossingLongitude =
        ((b.longitude - a.longitude) * (p.latitude - a.latitude)) / (b.latitude - a.latitude) + a.longitude;
      if (p.longitude < crossingLongitude) {
        inside = !inside;
      }
    }
    return inside;
  }
}
