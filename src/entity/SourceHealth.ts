/**
 * D-Fence — entity class `SourceHealth`
 * Stereotype: <<entity>>. Traces: 1.4.x, 10.2.2
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class SourceHealth {
  source!: SourceKind;
  lastSuccessAt!: Date | null;
  isWarning!: boolean;
}
