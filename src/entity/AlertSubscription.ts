/**
 * D-Fence — entity class `AlertSubscription`
 * Stereotype: <<entity>>. Traces: 6.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class AlertSubscription {
  id!: Uuid;
  savedLocationId!: Uuid;
  enabled!: boolean;
  growthThreshold!: number;
}
