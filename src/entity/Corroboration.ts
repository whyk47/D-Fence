/**
 * D-Fence — entity class `Corroboration`
 * Stereotype: <<entity>>. Traces: 5.1.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class Corroboration {
  id!: Uuid;
  reportId!: Uuid;
  accountId!: Uuid;
  confirmedAt!: Date;
}
