/**
 * D-Fence — the only class permitted to change Report.status.
 * Stereotype: <<control>>. Traces: 5.2.1–5.2.9, 5.3.4, 8.3.21, 8.5.1, 8.5.2.
 *
 * The same division as §8: `ReportController` decides what reports exist, `ModerationController`
 * decides whether one is genuine, and this class governs how a report moves between states. Both
 * delegate here, so 5.2.1's status set is enforced in exactly one place.
 *
 * It also implements `ReportLinkage`, which is how §8 reaches §5 without depending on it. The three
 * hooks left as `TODO(E5)` when work orders were built land here.
 */
import { ReportStatus, Role } from '../entity/enums';
import { Uuid } from '../entity/valueTypes';
import { Report } from '../entity/Report';
import { AuditStore, Notifier, ReportLinkage, ReportStore } from '../ports/Stores';
import { ReportActor, ReportTransitionTable } from './ReportTransitionTable';
import { Principal, SYSTEM_ACTOR_ID } from './Principal';

/** Raised when a status move is refused. Mirrors TransitionRefused: the reason must be stated. */
export class ReportTransitionRefused extends Error {
  constructor(
    readonly from: ReportStatus,
    readonly to: ReportStatus,
    readonly reason: string,
  ) {
    super(`report ${from} -> ${to} refused: ${reason}`);
    this.name = 'ReportTransitionRefused';
  }
}

export class ReportLifecycleController implements ReportLinkage {
  constructor(
    private readonly table: ReportTransitionTable,
    private readonly reports: ReportStore,
    private readonly notifier: Notifier | null,
    /**
     * 2.4.1. Placed on the **one write path** for `Report.status` rather than at each call site,
     * for the same reason 5.2.8's notification is: a hook here cannot be forgotten by a future
     * caller, and an audit trail with a hole in it is worse than none, because it reads complete.
     */
    private readonly audit: AuditStore | null = null,
  ) {}

  /**
   * The single write path for `Report.status`. Refuses before writing, records the change in the
   * append-only history, then notifies the reporter.
   *
   * 5.2.8 says "on **every** change to their report's status", so the notification is here rather
   * than at each call site — a hook on the one write path cannot be forgotten by a future caller,
   * which is exactly what happened to the equivalent rule in the Lab 2 model.
   *
   * @throws ReportTransitionRefused
   */
  async transition(
    id: Uuid,
    to: ReportStatus,
    by: ReportActor,
    options: { reason?: string; moderatorId?: Uuid; at?: Date } = {},
  ): Promise<Report> {
    const report = await this.require(id);
    const from = report.currentStatus();
    const at = options.at ?? new Date();

    const rule = this.table.find(from, to, by);
    if (rule === undefined) {
      throw new ReportTransitionRefused(
        from,
        to,
        this.table.isTerminal(from)
          ? `${from} is a settled status and has no outgoing move`
          : `no ${from} to ${to} move is permitted to ${by === 'SYSTEM' ? 'the system' : by}`,
      );
    }
    // 5.2.4 — a rejection without a reason of at least ten characters is refused before it is
    // written, not repaired afterwards with a placeholder.
    if (rule.requiresReason === true && (options.reason ?? '').trim().length < 10) {
      throw new ReportTransitionRefused(from, to, 'a reason of at least ten characters is required (5.2.4)');
    }

    report.applyStatus(to);
    if (by === Role.OperationsManager) {
      // 5.3.4 — the moderating user id, the timestamp and the reason, all three.
      report.moderatorId = options.moderatorId ?? null;
      report.moderatedAt = at;
      report.moderationReason = options.reason ?? null;
    }
    await this.reports.save(report);
    await this.reports.appendStatusChange(report.id, from, to, at);
    // 2.4.1 — after the write, never before: an operation refused by the rules above changed no
    // stored state, and logging it as though it had would make the trail unreadable as evidence.
    await this.audit?.appendAction(
      options.moderatorId ?? SYSTEM_ACTOR_ID,
      `report:status:${from} -> ${to}`,
      'Report',
      report.id,
    );
    await this.notifyReporter(report, from, to);
    return report;
  }

  /** 5.2.6 — the work order raised from these reports has been assigned. */
  async onWorkOrderAssigned(workOrderId: Uuid): Promise<void> {
    await this.moveLinked(workOrderId, ReportStatus.Actioned);
  }

  /**
   * 5.2.7, 8.5.1, 8.5.2 — the work order was verified complete, so every report it was raised from
   * is Closed and its reporter told. The notification is 8.5.2 and it comes free: `transition`
   * already owes 5.2.8 on every move.
   */
  async onWorkOrderVerified(workOrderId: Uuid): Promise<void> {
    await this.moveLinked(workOrderId, ReportStatus.Closed);
  }

  /**
   * 8.3.21 — the work order was cancelled, so each linked report returns to the status it held
   * before the work order took it. That prior status is read from the append-only history rather
   * than assumed to be Verified: a report can be actioned, restored and actioned again, and
   * hard-coding the destination would quietly be wrong the second time.
   */
  async onWorkOrderCancelled(workOrderId: Uuid): Promise<void> {
    for (const report of await this.reports.findForWorkOrder(workOrderId)) {
      const priorStatus = await this.statusBefore(report, ReportStatus.Actioned);
      if (priorStatus === null || priorStatus === report.currentStatus()) {
        continue;
      }
      await this.transition(report.id, priorStatus, 'SYSTEM');
    }
  }

  /** 5.3.1, 5.3.2, 5.3.3 — the queue, oldest first, optionally narrowed. */
  async queue(filter: { clusterId?: Uuid; type?: string } = {}): Promise<Report[]> {
    const submitted = await this.reports.findByStatus(ReportStatus.Submitted);
    return submitted
      .filter((r) => filter.clusterId === undefined || r.clusterId === filter.clusterId)
      .filter((r) => filter.type === undefined || r.type === filter.type)
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime()); // 5.3.2
  }

  private async moveLinked(workOrderId: Uuid, to: ReportStatus): Promise<void> {
    for (const report of await this.reports.findForWorkOrder(workOrderId)) {
      if (this.table.find(report.currentStatus(), to, 'SYSTEM') === undefined) {
        // A report already Rejected or Closed is left alone rather than forced: 8.5.1 closes the
        // reports a work order acted on, and one a moderator has since rejected is not among them.
        continue;
      }
      await this.transition(report.id, to, 'SYSTEM');
    }
  }

  /** The status held immediately before the report most recently entered `status`. */
  private async statusBefore(report: Report, status: ReportStatus): Promise<ReportStatus | null> {
    const history = await this.reports.statusHistory(report.id);
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const entry = history[i];
      if (entry !== undefined && entry.to === status) {
        return entry.from;
      }
    }
    return null;
  }

  /** 5.2.8, 8.5.2. Worded for the resident, not for the log (10.5.3). */
  private async notifyReporter(report: Report, from: ReportStatus, to: ReportStatus): Promise<void> {
    const wording: Record<ReportStatus, string> = {
      [ReportStatus.Submitted]: 'has been received',
      [ReportStatus.Verified]: 'has been verified by our operations team',
      [ReportStatus.Rejected]: `was not accepted: ${report.moderationReason ?? 'no reason was recorded'}`,
      [ReportStatus.Actioned]: 'has been scheduled for treatment',
      [ReportStatus.Closed]: 'has been treated and closed. Thank you for reporting it',
    };
    await this.notifier?.notify(
      report.reporterId,
      `Your report of ${report.type} at ${report.localityBinding} ${wording[to]}. (was ${from})`,
    );
  }

  private async require(id: Uuid): Promise<Report> {
    const report = await this.reports.findById(id);
    if (report === null) {
      throw new Error(`no report ${id}`);
    }
    return report;
  }

  /** Convenience for the moderation routes: the actor is always the manager making the request. */
  static actorFor(principal: Principal): ReportActor {
    if (principal.role !== Role.OperationsManager) {
      // 5.2.3 — a Resident or a crew member is not a moderation actor at all. AccessControlService
      // will already have refused; this is the second line, in the class that does the writing.
      throw new ReportTransitionRefused(
        ReportStatus.Submitted,
        ReportStatus.Verified,
        'only an Operations Manager may moderate a report (5.2.3)',
      );
    }
    return Role.OperationsManager;
  }
}
