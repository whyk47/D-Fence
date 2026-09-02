/**
 * D-Fence — entity class `Report`
 * Stereotype: <<entity>>. Traces: 5.1.x, 5.2.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class Report {
  id!: Uuid;
  reporterId!: Uuid;
  point!: GeoPoint;
  type!: ReportType;
  description!: string;
  /** 5.1.7 */
  clusterId!: Uuid | null;
  status!: ReportStatus;
  corroborationCount!: number;
  submittedAt!: Date;
  moderatedAt!: Date | null;
  moderationReason!: string | null;

  /** Submitted or Verified — the states a work order can act on. */
  isOpen(): boolean {
    // TODO
    throw new Error('not implemented');
  }

  /** Feeds the VerifiedOpenReportCount driver. */
  isVerified(): boolean {
    // TODO
    throw new Error('not implemented');
  }
}
