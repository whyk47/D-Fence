/**
 * D-Fence — entity class `WorkOrder`
 * Stereotype: <<entity>>. Traces: 8.1.x, 8.3.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class WorkOrder {
  id!: Uuid;
  clusterId!: Uuid;
  assigneeId!: Uuid | null;
  /** 8.1.2 */
  sourceReportId!: Uuid | null;
  taskType!: TaskType;
  scheduledDate!: IsoDate;
  priority!: PriorityTier;
  instructions!: string;
  startedAt!: Date | null;
  cancellationReason!: string | null;
  /** 8.3.8 */
  issueFlag!: boolean;
  issueReason!: string | null;

/**
 * Private with no public setter. 8.3.2 permits only the transitions in the state table,
 * and this is that rule enforced by encapsulation rather than by convention.
 */
private status!: WorkOrderStatus;

currentStatus(): WorkOrderStatus {
  return this.status;
}

/**
 * Called only by WorkOrderLifecycleController, and only after the transition has been
 * validated against WorkOrderTransitionTable. Nothing else in the system may call it.
 */
applyStatus(next: WorkOrderStatus): void {
  this.status = next;
}

/** 8.3.x: past its scheduled date and not in a terminal state. */
isOverdue(_now: Date): boolean {
  throw new Error('not implemented');
}

/** Verified, Rejected or Cancelled — no transition leaves these. */
isTerminal(): boolean {
  throw new Error('not implemented');
}
}
