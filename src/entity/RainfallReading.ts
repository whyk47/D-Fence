/**
 * D-Fence — entity class `RainfallReading`
 * Stereotype: <<entity>>. Traces: 1.2.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class RainfallReading {
  id!: Uuid;
  stationId!: string;
  readingAt!: Date;
  valueMm!: number;
}
