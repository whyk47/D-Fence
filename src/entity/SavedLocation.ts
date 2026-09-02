/**
 * D-Fence — entity class `SavedLocation`
 * Stereotype: <<entity>>. Traces: 3.1.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class SavedLocation {
  id!: Uuid;
  accountId!: Uuid;
  inputText!: string;
  point!: GeoPoint;
  label!: LocationLabel;
  name!: string;
  exposureStatus!: ExposureStatus;
  rain24hMm!: number;
  rain72hMm!: number;
  evaluatedAt!: Date;

  /** True when the status is IN_CLUSTER or WITHIN_150M (3.1.8). */
  isExposed(): boolean {
    // TODO
    throw new Error('not implemented');
  }
}
