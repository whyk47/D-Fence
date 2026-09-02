/**
 * D-Fence — entity class `CompletionEvidence`
 * Stereotype: <<entity>>. Traces: 8.4.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class CompletionEvidence {
  id!: Uuid;
  workOrderId!: Uuid;
  completedAt!: Date;
  taskPerformed!: TaskType;
  notes!: string;
  /** at least one required */
  photoKeys!: string[];
  rejectionReason!: string | null;
}
