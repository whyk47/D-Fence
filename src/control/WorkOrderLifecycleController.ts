/**
 * D-Fence — the only class permitted to change WorkOrder.status.
 * Stereotype: <<control>>. Traces: 6.5–6.8, 8.3.x, 8.4.x.
 *
 * DispatchController decides what work should exist and who does it; this class governs how a work
 * order moves between states. Assignment, reassignment and cancellation are themselves status
 * changes, so DispatchController delegates them here rather than writing status itself. Without
 * that, the model would claim one owner of the state machine and have two — which is exactly the
 * defect the Lab 2 adversarial review found.
 *
 * isTransitionPermitted() is the designated Lab 4 basis-path test subject.
 */
import { Role, WorkOrderStatus, TaskType } from '../entity/enums';
import { Uuid } from '../entity/valueTypes';
import { WorkOrder } from '../entity/WorkOrder';
import { CompletionEvidence } from '../entity/CompletionEvidence';
import { TreatmentRecord } from '../entity/TreatmentRecord';
import { WorkOrderRepository } from '../persistence/WorkOrderRepository';
import { TreatmentRecordRepository } from '../persistence/TreatmentRecordRepository';
import { WorkOrderTransitionTable } from './WorkOrderTransitionTable';
import { Principal } from './Principal';
import { NotificationController } from './NotificationController';
import { PriorityScoringEngine } from './PriorityScoringEngine';

/** Raised when a transition is refused. 8.3.16 requires the reason to be stated. */
export class TransitionRefused extends Error {
  constructor(
    readonly from: WorkOrderStatus,
    readonly to: WorkOrderStatus,
    readonly reason: string,
  ) {
    super(`transition ${from} -> ${to} refused: ${reason}`);
  }
}

export class WorkOrderLifecycleController {
  constructor(
    private readonly table: WorkOrderTransitionTable,
    private readonly workOrders: WorkOrderRepository,
    private readonly treatments: TreatmentRecordRepository,
    private readonly notifier: NotificationController,
    private readonly scoring: PriorityScoringEngine,
  ) {}

  /**
   * Pure predicate over the state table — no I/O, no repository, no clock. Kept pure on purpose:
   * it is the Lab 4 basis-path subject, and a method that reaches for a database cannot be
   * path-tested without one.
   *
   * @param from current status
   * @param to   requested status
   * @param by   the role attempting the move
   * @returns true when the state table permits it (8.3.2); false otherwise (8.3.3)
   */
  isTransitionPermitted(from: WorkOrderStatus, to: WorkOrderStatus, by: Role): boolean {
    return this.table.find(from, to, by) !== undefined;
  }

  /**
   * The single write path for WorkOrder.status. Validates against the table, checks the guard and
   * the assignee restriction, persists, and then does whatever the destination status obliges:
   * a treatment record on Verified (8.3.12), a rescore afterwards (4.1.17), a notification to the
   * crew member on Rejected (8.3.11).
   *
   * @throws TransitionRefused when 8.3.2 does not permit the move — carrying the reason 8.3.16 requires
   */
  async transition(_id: Uuid, _to: WorkOrderStatus, _by: Principal): Promise<WorkOrder> {
    // TODO(F8): look up, validate via isTransitionPermitted, apply guard and assigneeOnly,
    // wo.applyStatus(to), persist, then run the destination's obligations.
    throw new Error('not implemented');
  }

  /** 8.3.4. Assigned → Accepted, assigned crew member only. */
  accept(_id: Uuid, _by: Principal): Promise<WorkOrder> {
    throw new Error('not implemented');
  }

  /** 8.3.5, 8.3.17. Accepted → In Progress, and records the start timestamp. */
  start(_id: Uuid, _by: Principal): Promise<WorkOrder> {
    throw new Error('not implemented');
  }

  /**
   * 8.3.8. Sets the issue flag and reason at any time before completion. Deliberately NOT a status
   * transition — an issue is an annotation on a work order, not a state of it, which is why use
   * case 6.7 stopped being an <<extend>> of the completion flow after the Lab 1 critique.
   * The flagged order then appears on the dashboard (7.5.5).
   */
  raiseIssue(_id: Uuid, _reason: string, _by: Principal): Promise<WorkOrder> {
    throw new Error('not implemented');
  }

  /** 8.3.6, 8.3.7. In Progress → Completed. Refuses a submission carrying no photograph. */
  complete(_id: Uuid, _evidence: CompletionEvidence, _by: Principal): Promise<WorkOrder> {
    throw new Error('not implemented');
  }

  /**
   * 8.3.9, 8.3.12. Completed → Verified, writes the treatment record, and triggers a rescore:
   * 4.1.17 requires the next score to be lower, which is what closes the loop.
   */
  verify(_id: Uuid, _by: Principal): Promise<TreatmentRecord> {
    throw new Error('not implemented');
  }

  /** 8.3.10, 8.3.11. Completed → Rejected with a reason, and notifies the assigned crew member. */
  rejectCompletion(_id: Uuid, _reason: string, _by: Principal): Promise<WorkOrder> {
    throw new Error('not implemented');
  }
}
