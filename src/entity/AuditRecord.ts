/**
 * D-Fence — entity class `AuditRecord`
 * Stereotype: <<entity>>. Traces: 2.4.x, 2.3.8
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class AuditRecord {
  id!: Uuid;
  accountId!: Uuid;
  action!: string;
  targetEntity!: string;
  targetId!: Uuid;
  occurredAt!: Date;
}
