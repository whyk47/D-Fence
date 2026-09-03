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
   * 7.3.4 measures "creation to verified completion", so both ends have to be recorded. Neither
   * was: `startedAt` is 8.3.17's *work* start, which is a third instant and not either of these.
   * Derived from the audit trail instead would be wrong twice over — the trail is evidence, not a
   * reporting table, and it is optional wiring.
   */
  createdAt!: Date;
  verifiedAt: Date | null = null;

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

/**
 * 8.3.14: the scheduled date has passed and the status is not Completed, Verified or Cancelled.
 * Note that Rejected IS overdue-able — a rejected completion is work still outstanding (8.3.19).
 */
isOverdue(now: Date): boolean {
  const settled: WorkOrderStatus[] = [
    WorkOrderStatus.Completed,
    WorkOrderStatus.Verified,
    WorkOrderStatus.Cancelled,
  ];
  if (settled.includes(this.status)) {
    return false;
  }
  return this.scheduledDate < now.toISOString().slice(0, 10);
}

/** Verified and Cancelled — the state table gives them no outgoing transition. */
isTerminal(): boolean {
  return this.status === WorkOrderStatus.Verified || this.status === WorkOrderStatus.Cancelled;
}
}
