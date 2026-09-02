/**
 * D-Fence — entity class `ClusterRainfall`
 * Stereotype: <<entity>>. Traces: 1.2.x, 4.1.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class ClusterRainfall {
  clusterId!: Uuid;
  currentMm!: number;
  accum24hMm!: number;
  accum72hMm!: number;
  /** 10.2.2 */
  isStale!: boolean;
}
