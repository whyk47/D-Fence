/**
 * D-Fence — entity class `DriverContribution`
 * Stereotype: <<entity>>. Traces: 4.1.10
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class DriverContribution {
  driver!: Driver;
  rawValue!: number;
  normalisedValue!: number;
  weight!: number;
  contribution!: number;
}
