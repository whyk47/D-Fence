/**
 * D-Fence — the map's layers and the cluster detail panel.
 * Stereotype: <<control>>. Traces: 9.1.1–9.1.11, 2.3.1, 2.3.3, 2.3.4, 2.3.5, 5.2.9, 5.3.5.
 *
 * **The layers are assembled per principal, not filtered in the browser.** 9.1.4 says work orders
 * are shown to a manager and to the assigned crew member; 9.1.5 says a resident sees their own
 * saved locations. Those are the access rules of §2.3 wearing map clothes, and a client-side filter
 * over everything would ship one resident's home address to another resident's browser and rely on
 * the UI to hide it.
 *
 * 9.1.6 — showing and hiding a layer is the client's business. What belongs here is that the layers
 * arrive *separately*, so hiding one is possible at all.
 */
import { ExposureStatus, PriorityTier, ReportStatus, Role, WorkOrderStatus } from '../entity/enums';
import { Report } from '../entity/Report';
import { Uuid } from '../entity/valueTypes';
import { Trajectory } from '../entity/enums';
import {
  ClusterStore,
  PriorityScoreStore,
  ReportStore,
  SavedLocationStore,
  WorkOrderStore,
} from '../ports/Stores';
import { AccessControlService } from './AccessControlService';
import { SeriesPoint, TrendAnalyser } from './TrendAnalyser';
import { Principal } from './Principal';

/** 9.1.1, 9.1.2, 9.1.11 — one cluster as the map draws it. */
export interface ClusterShape {
  clusterId: Uuid;
  locality: string;
  /** Outer ring as [lng, lat] pairs — GeoJSON order, which is the reverse of how we say it. */
  ring: Array<[number, number]>;
  tier: PriorityTier;
  /** 9.1.11 — the tier as text, so the map does not rely on colour alone (11.7.5). */
  tierLabel: string;
  caseSize: number;
}

/** 9.1.3 — a report marker, anonymised for anyone but a manager (5.2.9). */
export interface ReportMarker {
  reportId: Uuid;
  latitude: number;
  longitude: number;
  status: string;
  type: string;
}

/** 9.1.4 */
export interface WorkOrderMarker {
  workOrderId: Uuid;
  clusterId: Uuid;
  latitude: number;
  longitude: number;
  status: WorkOrderStatus;
  taskType: string;
}

/** 9.1.5 */
export interface LocationMarker {
  savedLocationId: Uuid;
  latitude: number;
  longitude: number;
  label: string;
  exposureStatus: ExposureStatus;
}

/** 9.1.6 — named layers, so one can be hidden without the others. */
export interface MapLayers {
  clusters: ClusterShape[];
  reports: ReportMarker[];
  workOrders: WorkOrderMarker[];
  savedLocations: LocationMarker[];
}

/** 9.1.7, 9.1.8, 9.1.9, 9.1.10 — everything the detail panel shows. */
export interface ClusterDetail {
  clusterId: Uuid;
  locality: string;
  caseSize: number;
  score: number | null;
  tier: PriorityTier | null;
  /** 9.1.8, manager only. Field names mirror `DriverContribution` rather than renaming them. */
  breakdown: Array<{ driver: string; rawValue: number; normalisedValue: number; weight: number; contribution: number }>;
  isDegraded: boolean;
  excludedDrivers: string[];
  openReports: number;
  openWorkOrders: Array<{ workOrderId: Uuid; status: WorkOrderStatus; taskType: string; scheduledDate: string }>;
  series: SeriesPoint[];
  trajectory: Trajectory;
}

export class MapViewController {
  constructor(
    private readonly ac: AccessControlService,
    private readonly clusters: ClusterStore,
    private readonly scores: PriorityScoreStore,
    private readonly trends: TrendAnalyser,
    private readonly reports: ReportStore | null = null,
    private readonly workOrders: WorkOrderStore | null = null,
    private readonly locations: SavedLocationStore | null = null,
  ) {}

  /**
   * 9.1.1–9.1.6. The layers this principal is allowed to see, each one built from what their role
   * permits rather than assembled once and trimmed.
   */
  async layers(by: Principal): Promise<MapLayers> {
    // Every role may see cluster boundaries: 2.3.3 denies a Resident the dashboard and work
    // orders, not the map of where dengue is. That is the point of the product.
    await this.ac.authorise(by, 'cluster:read', { kind: 'cluster' });

    return {
      clusters: await this.clusterShapes(),
      reports: await this.reportMarkers(by),
      workOrders: await this.workOrderMarkers(by),
      savedLocations: await this.locationMarkers(by),
    };
  }

  /** 9.1.1, 9.1.2, 9.1.11 — active boundaries, tier-coloured and tier-labelled. */
  private async clusterShapes(): Promise<ClusterShape[]> {
    const latest = new Map((await this.scores.latest()).map((s) => [s.clusterId, s]));
    const shapes: ClusterShape[] = [];
    for (const cluster of await this.clusters.findActive()) {
      const ring = cluster.boundary?.rings[0] ?? [];
      if (ring.length === 0) {
        continue; // a cluster with no geometry cannot be drawn; it still appears in the table
      }
      const tier = latest.get(cluster.id)?.tier ?? PriorityTier.Low;
      shapes.push({
        clusterId: cluster.id,
        locality: cluster.locality,
        ring: ring.map((p) => [p.longitude, p.latitude] as [number, number]),
        tier,
        // 9.1.11, 11.7.5 — the tier as words. Colour alone fails for a colour-blind reader and on
        // a printout, and this is the requirement that was tightened in v0.3 for exactly that.
        tierLabel: `${tier} priority`,
        caseSize: cluster.caseSize,
      });
    }
    return shapes;
  }

  /**
   * 9.1.3, 5.2.9, 5.3.5 — report markers.
   *
   * A manager sees every report. A resident sees only reports that have been **verified**: an
   * unmoderated report is an unchecked claim about a specific address, and putting it on a public
   * map is the one way this feature could be used to harass a neighbour.
   */
  private async reportMarkers(by: Principal): Promise<ReportMarker[]> {
    if (this.reports === null) {
      return [];
    }
    const visible =
      by.role === Role.OperationsManager
        ? [...(await this.reports.findByStatus(ReportStatus.Submitted)), ...(await this.verifiedReports())]
        : await this.verifiedReports();
    return visible.map((r) => ({
      reportId: r.id,
      latitude: r.point.latitude,
      longitude: r.point.longitude,
      status: r.currentStatus(),
      type: r.type,
      // No reporter id, on any path: 5.2.9 is not conditional on the viewer's role for residents,
      // and a marker is exactly the shape of data that gets copied into a client without thinking.
    }));
  }

  /** 5.2.5's pair, reused: Verified and Actioned are the reports that are both real and live. */
  private async verifiedReports(): Promise<Report[]> {
    if (this.reports === null) {
      return [];
    }
    return [
      ...(await this.reports.findByStatus(ReportStatus.Verified)),
      ...(await this.reports.findByStatus(ReportStatus.Actioned)),
    ];
  }

  /** 9.1.4 — a manager sees all open work orders; a crew member sees only their own. */
  private async workOrderMarkers(by: Principal): Promise<WorkOrderMarker[]> {
    if (this.workOrders === null || by.role === Role.Resident) {
      return []; // 2.3.3 — a Resident has no work orders at all
    }
    const orders =
      by.role === Role.OperationsManager
        ? await this.workOrders.findAllOpen()
        : (await this.workOrders.findForAssignee(by.accountId)).filter((w) => !w.isTerminal());

    const markers: WorkOrderMarker[] = [];
    for (const order of orders) {
      const cluster = await this.clusters.findById(order.clusterId);
      const centroid = cluster?.boundary?.rings[0]?.length ? cluster.boundary.centroid() : null;
      if (centroid === null) {
        continue;
      }
      // A work order has no coordinates of its own — it is work on a cluster, so it is drawn at
      // that cluster's centre rather than given a fabricated point.
      markers.push({
        workOrderId: order.id,
        clusterId: order.clusterId,
        latitude: centroid.latitude,
        longitude: centroid.longitude,
        status: order.currentStatus(),
        taskType: order.taskType,
      });
    }
    return markers;
  }

  /** 9.1.5, 2.3.1 — a signed-in Resident's own saved locations, and nobody else's. */
  private async locationMarkers(by: Principal): Promise<LocationMarker[]> {
    if (this.locations === null || by.role !== Role.Resident) {
      return [];
    }
    return (await this.locations.findForAccount(by.accountId)).map((l) => ({
      savedLocationId: l.id,
      latitude: l.point.latitude,
      longitude: l.point.longitude,
      label: l.name,
      exposureStatus: l.exposureStatus,
    }));
  }

  /**
   * 9.1.7, 9.1.8, 9.1.9, 9.1.10 — the detail panel for one cluster.
   *
   * The score breakdown is manager-only. 2.3.4 gives them priority scores and 2.3.3 denies a
   * Resident the dashboard; a panel that showed the full driver breakdown to anyone who tapped a
   * boundary would be the dashboard, reached by a different route.
   */
  async clusterDetail(clusterId: Uuid, by: Principal, now = new Date()): Promise<ClusterDetail> {
    await this.ac.authorise(by, 'cluster:read', { kind: 'cluster', id: clusterId });
    const cluster = await this.clusters.findById(clusterId);
    if (cluster === null) {
      throw new Error(`no cluster ${clusterId}`);
    }
    const score = (await this.scores.latest()).find((s) => s.clusterId === clusterId) ?? null;
    const isManager = by.role === Role.OperationsManager;
    const series = await this.trends.caseSeries(clusterId, undefined, now);

    const openWorkOrders =
      this.workOrders === null || !isManager
        ? []
        : (await this.workOrders.findOpenForCluster(clusterId)).map((w) => ({
            workOrderId: w.id,
            status: w.currentStatus(),
            taskType: w.taskType,
            scheduledDate: w.scheduledDate,
          }));

    return {
      clusterId,
      locality: cluster.locality,
      caseSize: cluster.caseSize,
      score: score?.score ?? null,
      tier: score?.tier ?? null,
      breakdown: isManager ? (score?.breakdown() ?? []) : [],
      isDegraded: score?.isDegraded ?? false,
      excludedDrivers: score?.excludedDrivers ?? [],
      openReports: await this.openReportCount(clusterId),
      openWorkOrders,
      series,
      // 9.1.10 is computed over fourteen days even though the panel charts thirty: the chart and
      // the label answer different questions, and reusing the 30-day series for both would quietly
      // change what the label means.
      trajectory: await this.trends.trajectoryOf(clusterId, now),
    };
  }

  private async openReportCount(clusterId: Uuid): Promise<number> {
    if (this.reports === null) {
      return 0;
    }
    return (await this.reports.verifiedOpenCountByCluster()).get(clusterId) ?? 0;
  }
}
