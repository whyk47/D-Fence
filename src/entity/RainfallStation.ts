/**
 * D-Fence — entity class `RainfallStation`
 * Stereotype: <<entity>>. Traces: 1.2.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class RainfallStation {
  id!: Uuid;
  stationId!: string;
  name!: string;
  point!: GeoPoint;
}
