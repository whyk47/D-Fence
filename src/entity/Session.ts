/**
 * D-Fence — entity class `Session`
 * Stereotype: <<entity>>. Traces: 2.1.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class Session {
  id!: Uuid;
  accountId!: Uuid;
  issuedAt!: Date;
  lastActiveAt!: Date;
  terminatedAt!: Date | null;
}
