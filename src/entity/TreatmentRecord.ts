/**
 * D-Fence — entity class `TreatmentRecord`
 * Stereotype: <<entity>>. Traces: 8.3.12, 8.5.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class TreatmentRecord {
  id!: Uuid;
  clusterId!: Uuid;
  workOrderId!: Uuid;
  taskType!: TaskType;
  completionDate!: IsoDate;
}
