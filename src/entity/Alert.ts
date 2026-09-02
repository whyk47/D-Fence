/**
 * D-Fence — entity class `Alert`
 * Stereotype: <<entity>>. Traces: 6.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class Alert {
  id!: Uuid;
  savedLocationId!: Uuid;
  triggerType!: AlertTrigger;
  sentAt!: Date;
  outcome!: DeliveryOutcome;
  payload!: string;
}
