/**
 * D-Fence — entity class `IngestionRun`
 * Stereotype: <<entity>>. Traces: 1.4.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class IngestionRun {
  id!: Uuid;
  source!: SourceKind;
  startedAt!: Date;
  endedAt!: Date | null;
  featureCount!: number;
  outcome!: string;
  trigger!: string;
}
