/**
 * D-Fence — entity class `Cluster`
 * Stereotype: <<entity>>. Traces: 1.1.x, 9.1.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';
import { ClusterSnapshot } from './ClusterSnapshot';

export class Cluster {
  id!: Uuid;
  /** NEA feed identity */
  objectId!: string;
  locality!: string;
  boundary!: Polygon;
  caseSize!: number;
  premisesMix!: PremisesMix;
  caseDelta!: number;
  changeClass!: ChangeClass;
  forecastRegion!: ForecastRegion;
  heavyRainExpected!: boolean;
  trajectory!: Trajectory;
  firstSeenAt!: Date;
  lastUpdatedAt!: Date;
  isActive!: boolean;

  /** Most recent stored snapshot. The feed publishes current values only. */
  latestSnapshot(): ClusterSnapshot {
    // TODO
    throw new Error('not implemented');
  }

  /** Case growth over a window (1.1.8, 9.1.9). */
  deltaOver(days: number): number {
    // TODO
    throw new Error('not implemented');
  }

  /** Feeds the DaysSinceLastTreatment driver (4.1.17). */
  daysSinceLastTreatment(now: Date): number {
    // TODO
    throw new Error('not implemented');
  }
}
