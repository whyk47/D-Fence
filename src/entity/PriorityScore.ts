/**
 * D-Fence — entity class `PriorityScore`
 * Stereotype: <<entity>>. Traces: 4.1.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';
import { DriverContribution } from './DriverContribution';

export class PriorityScore {
  id!: Uuid;
  clusterId!: Uuid;
  computedAt!: Date;
  score!: number;
  tier!: PriorityTier;
  /** 4.1.x */
  isDegraded!: boolean;
  excludedDrivers!: Driver[];
  rank!: number;

  /** The seven contributions (4.1.10). Never recomputed for display. */
  breakdown(): DriverContribution[] {
    // TODO
    throw new Error('not implemented');
  }

  /** Human-readable justification shown on Cluster Detail (9.x). */
  explain(): string {
    // TODO
    throw new Error('not implemented');
  }
}
