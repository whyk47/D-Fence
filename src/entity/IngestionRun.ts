/**
 * D-Fence — entity class `IngestionRun`
 * Stereotype: <<entity>>. Traces: 1.4.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome, PestType,
} from './enums';

export class IngestionRun {
  id!: Uuid;
  source!: SourceKind;
  startedAt!: Date;
  endedAt!: Date | null;
  featureCount!: number;
  outcome!: string;
  trigger!: string;

  /**
   * 1.5.14 — populated only by the observation job, and null for every other source.
   *
   * Optional fields on a shared entity are a smell, and the alternative was weighed: a separate
   * `ObservationIngestionRun` table. It was rejected because 1.4.x reads run history across *all*
   * sources to decide whether a source is stale, and a second table would mean either a union in
   * every one of those queries or an observation feed that silently never goes stale. One nullable
   * column set, documented, costs less than a source the health view cannot see.
   */
  pestType!: PestType | null;
  acceptedCount!: number | null;
  rejectedCount!: number | null;
}
