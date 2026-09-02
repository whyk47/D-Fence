/**
 * D-Fence — entity class `ReportPhoto`
 * Stereotype: <<entity>>. Traces: 5.1.x, 10.3.5
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class ReportPhoto {
  id!: Uuid;
  reportId!: Uuid;
  /** object storage, not the database */
  storageKey!: string;
  visibility!: string;
}
