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
import { Uuid, singaporeDate } from '../entity/valueTypes';
import { WorkOrder } from '../entity/WorkOrder';
import { CompletionEvidence } from '../entity/CompletionEvidence';
import { COMPLETION_EVIDENCE } from '../ports/ObjectStorage';
import { TreatmentRecord } from '../entity/TreatmentRecord';
import { AuditStore, Notifier, ReportLinkage, Rescorer, TreatmentRecordStore, WorkOrderStore } from '../ports/Stores';
import { WorkOrderTransitionTable, explainUnmetGuard } from './WorkOrderTransitionTable';
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

/**
 * The one thing this controller needs from object storage, and nothing else.
 *
 * Narrower than `ObjectStorage` on purpose: a control class that could `upload` and `remove` would
 * invite a future edit that writes files from inside a state transition, and the whole point of
 * this being the single write path for `WorkOrder.status` is that it does one thing.
 */
export interface EvidenceStorage {
  exists(bucket: string, key: string): Promise<boolean>;
}

export class WorkOrderLifecycleController {
  constructor(
    private readonly table: WorkOrderTransitionTable,
    private readonly workOrders: WorkOrderStore,
    private readonly treatments: TreatmentRecordStore,
    private readonly notifier: Notifier | null,
    private readonly rescorer: Rescorer | null,
    /** 5.2.7, 8.5.1, 8.5.2. Optional: §8 was built before reports existed and still runs without them. */
    private readonly reports: ReportLinkage | null = null,
    /**
     * 2.4.1, on the single write path for `WorkOrder.status`. Every accept, start, completion,
     * verification, rejection and cancellation is one row, written in one place — including the
     * ones DispatchController delegates here, which is why assignment does not need its own
     * status entry.
     */
    private readonly audit: AuditStore | null = null,
    /**
     * 8.3.7 — where a photograph key is checked against something that can say whether it names
     * a real object.
     *
     * Null means "cannot check", and that is a deliberately uncomfortable state rather than a
     * convenience: it is what every construction site did implicitly before this parameter existed,
     * and it is why `photoKeys: ["not-a-real-file-at-all"]` closed a work order and the acceptance
     * harness called 8.3.7 met. It is null-able only because the older unit suites construct this
     * class to exercise the transition table and have no storage to give it — the server passes a
     * real one, and `completionEvidenceRefused` below says which mode it is in.
     */
    private readonly storage: EvidenceStorage | null = null,
  ) {}

  /**
   * 8.3.7, 10.3.6 — which of these keys name nothing, in the order they were given.
   *
   * Separated from `complete` so the refusal can count them: a crew member who uploaded three
   * photographs and had one fail needs to be told one failed, not that "the evidence is invalid".
   */
  async completionEvidenceRefused(photoKeys: string[]): Promise<string[]> {
    if (this.storage === null) {
      return [];
    }
    const missing: string[] = [];
    for (const key of photoKeys) {
      if (!(await this.storage.exists(COMPLETION_EVIDENCE, key))) {
        missing.push(key);
      }
    }
    return missing;
  }

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
      // The requirement number stays in the traceability and in the tests; what reaches the person
      // is a sentence describing what is missing. A crew member completing a job saw
      // "the conditions of 8.3.6, 8.3.7 are not met", which tells them nothing they can act on.
      throw new TransitionRefused(from, to, explainUnmetGuard(rule.guard));
    }

    workOrder.applyStatus(to);
    if (to === WorkOrderStatus.InProgress && workOrder.startedAt === null) {
      workOrder.startedAt = new Date(); // 8.3.17
    }
    if (to === WorkOrderStatus.Verified) {
      // 7.3.4's right-hand end. Set here rather than in `verify()` so a verification reached by
      // any future path still stamps it — the same argument as the audit hook two lines below.
      workOrder.verifiedAt = new Date();
    }
    await this.workOrders.save(workOrder);
    // 2.4.1 — after the write and before the destination's obligations, so a failing notification
    // cannot lose the record of a change that has already happened.
    await this.audit?.appendAction(by.accountId, `workOrder:status:${from} -> ${to}`, 'WorkOrder', workOrder.id);
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
    const saved = await this.workOrders.save(workOrder);
    // 8.3.8 is deliberately not a status transition, so it is not covered by the hook above — and
    // it changes stored state, which is what 2.4.1 asks about.
    await this.audit?.appendAction(by.accountId, 'workOrder:raiseIssue', 'WorkOrder', workOrder.id);
    return saved;
  }

  /**
   * 8.3.6, 8.3.7. In Progress → Completed. The evidence is stored **before** the transition is
   * attempted, because the guard reads it; a submission that fails the guard therefore leaves a
   * record of what was submitted, which is what a crew member disputing a refusal will need.
   */
  async complete(id: Uuid, evidence: CompletionEvidence, by: Principal): Promise<WorkOrder> {
    /**
     * 8.3.7 — the photographs must exist before the job is closed.
     *
     * Checked here, before the evidence row is saved and before the transition, because the order
     * is the whole point. Saving first and validating after would leave a `completion_evidence` row
     * referring to keys that name nothing, on a work order still In Progress — a state no screen
     * renders honestly and nobody can clear.
     *
     * The transition table's `HAS_EVIDENCE` guard checks `photoKeys.length > 0` and cannot do more:
     * it is synchronous and knows nothing about storage. That gap is exactly where the defect
     * lived, and it is closed here rather than by making every guard asynchronous for one rule.
     */
    const missing = await this.completionEvidenceRefused(evidence.photoKeys ?? []);
    if (missing.length > 0) {
      const wo = await this.workOrders.findById(id);
      throw new TransitionRefused(
        wo?.currentStatus() ?? WorkOrderStatus.InProgress,
        WorkOrderStatus.Completed,
        missing.length === (evidence.photoKeys ?? []).length
          ? 'the photograph was not received — upload it again before completing (8.3.7)'
          : `${missing.length} of ${(evidence.photoKeys ?? []).length} photographs were not received — upload them again before completing (8.3.7)`,
      );
    }
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
    // In Singapore's calendar: the crew's day, not UTC's. A job completed at 1 am was being
    // stamped with the previous date and read as a day old the moment it was written.
    record.completionDate = singaporeDate(evidence?.completedAt ?? new Date());
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
      // 8.5.1, 8.5.2, 5.2.7 — close every linked report and tell the residents who filed them.
      // Before the rescore, not after: closing a report removes it from 5.2.5's count, and the
      // cycle that follows must see that removal, or the score keeps a driver for work now done.
      await this.reports?.onWorkOrderVerified(workOrder.id);
      // 8.5.3 — within one scoring cycle. Calling it here makes the demo beat immediate rather than
      // waiting for the hourly cycle, which matters because 4.1.17 is the thing being shown.
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
