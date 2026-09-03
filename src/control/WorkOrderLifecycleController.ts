/**
 * D-Fence — the only class permitted to change WorkOrder.status.
 * Stereotype: <<control>>. Traces: 8.2.4, 8.2.6, 8.3.1–8.3.21, 8.5.1–8.5.3, 4.1.17.
 *
 * DispatchController decides what work should exist and who does it; this class governs how a work
 * order moves between states. Assignment, reassignment and cancellation are themselves status
 * changes, so DispatchController delegates them here rather than writing status itself. Without
 * that, the model would claim one owner of the state machine and have two — which is exactly the
 * defect the Lab 2 adversarial review found.
 *
 * `isTransitionPermitted()` is the designated Lab 4 basis-path subject and is deliberately pure.
 */
import { Role, WorkOrderStatus } from '../entity/enums';
import { Uuid } from '../entity/valueTypes';
import { WorkOrder } from '../entity/WorkOrder';
import { CompletionEvidence } from '../entity/CompletionEvidence';
import { TreatmentRecord } from '../entity/TreatmentRecord';
import { Notifier, Rescorer, TreatmentRecordStore, WorkOrderStore } from '../ports/Stores';
import { WorkOrderTransitionTable } from './WorkOrderTransitionTable';
import { Principal } from './Principal';

/** Raised when a transition is refused. 8.3.16 requires the reason to be stated. */
export class TransitionRefused extends Error {
  constructor(
    readonly from: WorkOrderStatus,
    readonly to: WorkOrderStatus,
    readonly reason: string,
  ) {
    super(`transition ${from} -> ${to} refused: ${reason}`);
    this.name = 'TransitionRefused';
  }
}

export class WorkOrderLifecycleController {
  constructor(
    private readonly table: WorkOrderTransitionTable,
    private readonly workOrders: WorkOrderStore,
    private readonly treatments: TreatmentRecordStore,
    private readonly notifier: Notifier | null,
    private readonly rescorer: Rescorer | null,
  ) {}

  /**
   * Pure predicate over the state table — no I/O, no repository, no clock. Kept pure on purpose:
   * it is the Lab 4 basis-path subject, and a method that reaches for a database cannot be
   * path-tested without one.
   *
   * @returns true when the state table permits it (8.3.2); false otherwise (8.3.3)
   */
  isTransitionPermitted(from: WorkOrderStatus, to: WorkOrderStatus, by: Role): boolean {
    return this.table.find(from, to, by) !== undefined;
  }

  /**
   * The single write path for WorkOrder.status. Validates against the table, checks the guard and
   * the assignee restriction, persists, then runs the destination's obligations.
   *
   * The order is deliberate: **refuse before writing anything**. Three separate checks can refuse —
   * the table (8.3.2/8.3.3), the assignee restriction (8.3.4/8.3.5/8.3.6/8.3.20) and the guard
   * (8.3.6/8.3.7/8.3.10/8.3.18) — and each states its own reason, because 8.3.16 requires the
   * refusal to say *why*, not merely that it happened.
   *
   * @throws TransitionRefused
   */
  async transition(id: Uuid, to: WorkOrderStatus, by: Principal): Promise<WorkOrder> {
    const workOrder = await this.require(id);
    const from = workOrder.currentStatus();

    const rule = this.table.find(from, to, by.role);
    if (rule === undefined) {
      throw new TransitionRefused(
        from,
        to,
        this.table.isTerminal(from)
          ? `${from} is terminal`
          : `the state table permits no ${from} to ${to} move by a ${by.role}`,
      );
    }
    if (rule.assigneeOnly && workOrder.assigneeId !== by.accountId) {
      // 8.3.4/8.3.5/8.3.20: "the assigned Cleaning Crew Member", not any crew member. Without this
      // check the role alone would let one crew member complete another's job.
      throw new TransitionRefused(from, to, 'only the assigned crew member may make this move');
    }
    const evidence = await this.workOrders.latestEvidence(id);
    if (!rule.guard(workOrder, evidence)) {
      throw new TransitionRefused(from, to, `the conditions of ${rule.requirement} are not met`);
    }

    workOrder.applyStatus(to);
    if (to === WorkOrderStatus.InProgress && workOrder.startedAt === null) {
      workOrder.startedAt = new Date(); // 8.3.17
    }
    await this.workOrders.save(workOrder);
    await this.onEntering(to, workOrder);
    return workOrder;
  }

  /** 8.3.4. Assigned → Accepted, assigned crew member only. */
  accept(id: Uuid, by: Principal): Promise<WorkOrder> {
    return this.transition(id, WorkOrderStatus.Accepted, by);
  }

  /** 8.3.5, 8.3.17. Accepted → In Progress, and records the start timestamp. */
  start(id: Uuid, by: Principal): Promise<WorkOrder> {
    return this.transition(id, WorkOrderStatus.InProgress, by);
  }

  /**
   * 8.3.8. Sets the issue flag and reason at any time before completion. Deliberately NOT a status
   * transition — an issue is an annotation on a work order, not a state of it, which is why use
   * case 6.7 stopped being an `<<extend>>` of the completion flow after the Lab 1 critique.
   * The flagged order then appears on the dashboard (7.5.5).
   */
  async raiseIssue(id: Uuid, reason: string, by: Principal): Promise<WorkOrder> {
    const workOrder = await this.require(id);
    if (by.role !== Role.CleaningCrew || workOrder.assigneeId !== by.accountId) {
      throw new TransitionRefused(workOrder.currentStatus(), workOrder.currentStatus(), 'only the assigned crew member may raise an issue');
    }
    // "at any time before completion" (8.3.8) — so Completed, Verified and Cancelled are too late.
    const tooLate: WorkOrderStatus[] = [WorkOrderStatus.Completed, WorkOrderStatus.Verified, WorkOrderStatus.Cancelled];
    if (tooLate.includes(workOrder.currentStatus())) {
      throw new TransitionRefused(workOrder.currentStatus(), workOrder.currentStatus(), 'an issue may only be raised before completion (8.3.8)');
    }
    if (reason.trim() === '') {
      throw new TransitionRefused(workOrder.currentStatus(), workOrder.currentStatus(), 'an issue requires a reason (8.3.8)');
    }
    workOrder.issueFlag = true;
    workOrder.issueReason = reason;
    return this.workOrders.save(workOrder);
  }

  /**
   * 8.3.6, 8.3.7. In Progress → Completed. The evidence is stored **before** the transition is
   * attempted, because the guard reads it; a submission that fails the guard therefore leaves a
   * record of what was submitted, which is what a crew member disputing a refusal will need.
   */
  async complete(id: Uuid, evidence: CompletionEvidence, by: Principal): Promise<WorkOrder> {
    evidence.workOrderId = id;
    await this.workOrders.saveEvidence(evidence);
    return this.transition(id, WorkOrderStatus.Completed, by);
  }

  /**
   * 8.3.9, 8.3.12. Completed → Verified, writes the treatment record, and triggers a rescore:
   * 4.1.17 requires the next score to be lower, which is what closes the loop.
   */
  async verify(id: Uuid, by: Principal): Promise<TreatmentRecord> {
    const workOrder = await this.transition(id, WorkOrderStatus.Verified, by);
    const evidence = await this.workOrders.latestEvidence(id);
    const record = new TreatmentRecord();
    record.clusterId = workOrder.clusterId;
    record.workOrderId = workOrder.id;
    record.taskType = workOrder.taskType;
    // 8.3.12 names the *completion* date, not the verification date: the treatment happened when
    // the crew did the work, and the recency driver in 4.1.15 measures from that.
    record.completionDate = (evidence?.completedAt ?? new Date()).toISOString().slice(0, 10);
    return this.treatments.save(record);
  }

  /**
   * 8.3.19, 8.3.20. Rejected → In Progress: the assigned crew member resumes work on a completion
   * their manager rejected. Rejected is a resting state a screen can display, not a status the
   * system passes through, so this is a real user action and it is drawn on the dialog map.
   */
  resume(id: Uuid, by: Principal): Promise<WorkOrder> {
    return this.transition(id, WorkOrderStatus.InProgress, by);
  }

  /** 8.3.10, 8.3.11. Completed → Rejected with a reason, and notifies the assigned crew member. */
  async rejectCompletion(id: Uuid, reason: string, by: Principal): Promise<WorkOrder> {
    const evidence = await this.workOrders.latestEvidence(id);
    if (evidence === null) {
      throw new TransitionRefused(WorkOrderStatus.Completed, WorkOrderStatus.Rejected, 'there is no completion to reject');
    }
    // The reason belongs to the attempt, so it is written onto the evidence the guard will read.
    evidence.rejectionReason = reason;
    await this.workOrders.saveEvidence(evidence);
    return this.transition(id, WorkOrderStatus.Rejected, by);
  }

  /** What each destination status obliges, in one place rather than scattered across the callers. */
  private async onEntering(status: WorkOrderStatus, workOrder: WorkOrder): Promise<void> {
    if (status === WorkOrderStatus.Rejected && workOrder.assigneeId !== null) {
      // 8.3.11
      await this.notifier?.notify(workOrder.assigneeId, `Your completion was rejected for work order ${workOrder.id}.`);
    }
    if (status === WorkOrderStatus.Verified) {
      // 8.5.3 — within one scoring cycle. Calling it here makes the demo beat immediate rather than
      // waiting for the hourly cycle, which matters because 4.1.17 is the thing being shown.
      // TODO(E5): 8.5.1 — set every report linked to this work order to Closed, and 8.5.2 notify
      // the reporting residents. Reports do not exist yet; this is where that hook belongs.
      await this.rescorer?.rescoreCluster(workOrder.clusterId);
    }
  }

  private async require(id: Uuid): Promise<WorkOrder> {
    const workOrder = await this.workOrders.findById(id);
    if (workOrder === null) {
      throw new Error(`no work order ${id}`);
    }
    return workOrder;
  }
}
