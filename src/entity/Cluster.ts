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
  /** 1.3.2, 1.3.5 — the region the heavy-rain flag was read from, recorded so its basis is
   *  inspectable rather than implied by the cluster's coordinates. */
  forecastRegion!: ForecastRegion;
  heavyRainExpected!: boolean;
  /** 1.3.4 — the validity period of the forecast the flag was derived from. Null until a forecast
   *  cycle has run; a flag with no window behind it is not a claim about any particular day. */
  forecastValidFrom: Date | null = null;
  forecastValidTo: Date | null = null;
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

  /** Days since the most recent verified treatment record (4.1.15); 90 when there is none (4.1.16). */
  daysSinceLastTreatment(now: Date): number {
    // TODO
    throw new Error('not implemented');
  }
}
