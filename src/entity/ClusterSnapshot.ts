/**
 * D-Fence — entity class `ClusterSnapshot`
 * Stereotype: <<entity>>. Traces: 1.1.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class ClusterSnapshot {
  id!: Uuid;
  clusterId!: Uuid;
  retrievedAt!: Date;
  caseSize!: number;
  boundary!: Polygon;
  /** feed's own update stamp */
  fmelUpdD!: string;

  /** Change detection for 1.1.x; drives ChangeClass. */
  differsFrom(other: ClusterSnapshot): boolean {
    // TODO
    throw new Error('not implemented');
  }
}
