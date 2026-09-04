/**
 * D-Fence — deciding what work should exist and who does it.
 * Stereotype: <<control>>. Traces: 8.1.1–8.1.13, 8.2.1–8.2.7, 8.3.13, 8.3.18, 8.3.21, 8.4.1–8.4.6.
 *
 * Assignment, reassignment and cancellation are status changes, so this class does NOT write
 * `WorkOrder.status`. It calls WorkOrderLifecycleController, which validates against the state
 * table first. Requirement 8.3.2 is then enforced in exactly one place — the Lab 2 adversarial
 * review found a version of this model that claimed one owner of the state machine and drew two.
 */
import { PriorityTier, Role, TaskType, WorkOrderStatus } from '../entity/enums';
import { IsoDate, Uuid, singaporeDate } from '../entity/valueTypes';
import { WorkOrder } from '../entity/WorkOrder';
import { Cluster } from '../entity/Cluster';
import { AuditStore, ClusterStore, Notifier, PriorityScoreStore, ReportLinkage, ReportStore, WorkOrderStore } from '../ports/Stores';
import { WorkOrderLifecycleController, TransitionRefused } from './WorkOrderLifecycleController';
import { AccessControlService } from './AccessControlService';
import { Principal } from './Principal';

export interface WorkOrderDraft {
  clusterId: Uuid;
  taskType: TaskType;
  scheduledDate: IsoDate;
  instructions?: string;
  /** 8.1.2 — the verified report this was raised from, when it was raised from one. */
  sourceReportId?: Uuid;
}

/** One row of the proposed daily list (8.1.7). */
export interface DispatchProposal {
  clusterId: Uuid;
  locality: string;
  score: number;
  tier: PriorityTier;
  suggestedTaskType: TaskType;
  scheduledDate: IsoDate;
}

/** Raised when creation is refused. 8.1.12 obliges us to hand back the order that blocked it. */
export class DuplicateWorkOrder extends Error {
  constructor(readonly existing: WorkOrder) {
    super(`an open ${existing.taskType} work order already exists for this cluster`);
    this.name = 'DuplicateWorkOrder';
  }
}

/**
 * A dispatch action refused on its own contents — a date in the past, an over-long instruction, an
 * assignee who cannot hold the job (8.1.1, 8.1.4, 8.1.6, 8.2.3).
 *
 * These were bare `Error`s, which `WorkOrderRoutes` had no branch for, so every one of them reached
 * the generic handler and came back as **500 "the request could not be completed / retry"**. The
 * message the control layer had carefully written — "scheduled date 2026-09-01 is in the past" —
 * went to the server log instead of to the manager who had just typed the date. Telling someone to
 * retry a request that cannot ever succeed is worse than saying nothing.
 *
 * `ReportRejected`, `LocationRejected` and `AlertPreferenceRejected` are the same idea; this file
 * was simply the one that never got it.
 */
export class WorkOrderRejected extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'WorkOrderRejected';
  }
}

/** Separate from the above because the remedy differs: nothing the caller retypes will help. */
export class WorkOrderNotFound extends Error {
  constructor(readonly what: string) {
    super(what);
    this.name = 'WorkOrderNotFound';
  }
}

export class DispatchController {
  constructor(
    private readonly ac: AccessControlService,
    private readonly lifecycle: WorkOrderLifecycleController,
    private readonly workOrders: WorkOrderStore,
    private readonly clusters: ClusterStore,
    private readonly scores: PriorityScoreStore,
    private readonly notifier: Notifier | null,
    /** 5.2.6, 8.3.21. Optional for the same reason as in the lifecycle controller. */
    private readonly reports: ReportLinkage | null = null,
    /** 8.1.8 — configurable, default ten. */
    private readonly dispatchListLimit = 10,
    /**
     * 2.4.1. Only the changes this class makes **itself** are recorded here — creation, the
     * assignee field and the cancellation reason. The status moves it delegates are recorded by
     * WorkOrderLifecycleController, so an assignment produces two rows: the assignee changed and
     * the status changed. That is two facts, not one fact twice, and a reviewer asking "who
     * moved this order to Assigned" and "who put Ah Meng on it" is asking two questions.
     */
    private readonly audit: AuditStore | null = null,
  ) {}

  /**
   * 8.1.7, 8.1.8 — the day's suggested work: the highest-scoring active clusters that have **no
   * open work order**, capped at the configured limit.
   *
   * The exclusion is the point. A ranked list that keeps proposing the same top cluster every
   * morning, because it is still the highest-scoring one while a crew is already working it, is a
   * list a manager stops reading by Wednesday.
   */
  async proposeDailyList(date: IsoDate, by: Principal): Promise<DispatchProposal[]> {
    await this.ac.authorise(by, 'workOrder:write', { kind: 'workOrder' });
    const latest = await this.scores.latest();
    const active = new Map((await this.clusters.findActive()).map((c) => [c.id, c]));

    const proposals: DispatchProposal[] = [];
    for (const score of [...latest].sort((a, b) => a.rank - b.rank)) {
      if (proposals.length >= this.dispatchListLimit) {
        break;
      }
      const cluster = active.get(score.clusterId);
      if (cluster === undefined) {
        continue;
      }
      if ((await this.workOrders.findOpenForCluster(cluster.id)).length > 0) {
        continue;
      }
      proposals.push({
        clusterId: cluster.id,
        locality: cluster.locality,
        score: score.score,
        tier: score.tier,
        suggestedTaskType: DispatchController.suggestTask(cluster),
        scheduledDate: date,
      });
    }
    return proposals;
  }

  /**
   * 8.1.1–8.1.6, 8.1.11, 8.1.12, 8.3.15.
   * Creation is not a transition: 8.3.15 sets the initial status directly, and the state table
   * deliberately has no rule into Created.
   *
   * @throws DuplicateWorkOrder carrying the existing order, which 8.1.12 requires us to offer
   */
  async createWorkOrder(draft: WorkOrderDraft, by: Principal): Promise<WorkOrder> {
    await this.ac.authorise(by, 'workOrder:write', { kind: 'workOrder' });

    const cluster = await this.clusters.findById(draft.clusterId);
    if (cluster === null) {
      throw new WorkOrderNotFound(`no active cluster ${draft.clusterId}`); // 8.1.1
    }
    // 8.1.4 — a scheduled date that is not in the past. Compared as calendar dates in Singapore
    // time, because "today" is a date to a planner, not an instant.
    if (draft.scheduledDate < DispatchController.today()) {
      throw new WorkOrderRejected(`scheduled date ${draft.scheduledDate} is in the past (8.1.4)`);
    }
    if ((draft.instructions ?? '').length > 1000) {
      throw new WorkOrderRejected('instructions exceed 1000 characters (8.1.6)');
    }
    const clash = (await this.workOrders.findOpenForCluster(draft.clusterId)).find(
      (w) => w.taskType === draft.taskType,
    );
    if (clash !== undefined) {
      throw new DuplicateWorkOrder(clash); // 8.1.11, 8.1.12
    }

    const workOrder = new WorkOrder();
    workOrder.clusterId = draft.clusterId;
    workOrder.taskType = draft.taskType;
    workOrder.scheduledDate = draft.scheduledDate;
    workOrder.instructions = draft.instructions ?? '';
    workOrder.sourceReportId = draft.sourceReportId ?? null;
    workOrder.assigneeId = null;
    workOrder.startedAt = null;
    workOrder.cancellationReason = null;
    workOrder.issueFlag = false;
    workOrder.issueReason = null;
    // 8.1.5 — default the priority to the cluster's current tier.
    workOrder.priority = await this.tierOf(cluster.id);
    workOrder.createdAt = new Date(); // 7.3.4's left-hand end
    workOrder.applyStatus(WorkOrderStatus.Created); // 8.3.15
    const saved = await this.workOrders.save(workOrder);
    // 2.4.1. Creation does not pass through the lifecycle controller — 8.3.15 makes Created the
    // initial state rather than a transition into it — so this row has no counterpart there.
    await this.audit?.appendAction(by.accountId, 'workOrder:create', 'WorkOrder', saved.id);
    return saved;
  }

  /**
   * 8.2.1, 8.2.3, 8.2.4 — assign to exactly one crew member, refuse a deactivated account, notify
   * within a minute. Delegates the status change (Created → Assigned) to the lifecycle controller.
   *
   * @param isActiveAccount supplied by the caller until E2 exists; a deactivated account must be
   *   refused (8.2.3), and defaulting that to "active" would be a silent security decision.
   */
  async assign(id: Uuid, crewId: Uuid, by: Principal, isActiveAccount = true): Promise<WorkOrder> {
    await this.ac.authorise(by, 'workOrder:write', { kind: 'workOrder', id });
    if (!isActiveAccount) {
      throw new WorkOrderRejected('cannot assign to a deactivated account (8.2.3)');
    }
    const workOrder = await this.requireOrder(id);
    const previous = workOrder.assigneeId;

    workOrder.assigneeId = crewId;
    await this.workOrders.save(workOrder);
    await this.workOrders.appendAssignmentHistory(id, crewId, new Date()); // 8.2.7
    // 2.4.1. `previous` is carried into the action so the trail answers "reassigned from whom",
    // which the assignment history holds but the audit log would otherwise not.
    await this.audit?.appendAction(
      by.accountId,
      previous === null ? `workOrder:assign:${crewId}` : `workOrder:reassign:${previous} -> ${crewId}`,
      'WorkOrder',
      id,
    );

    const assigned = await this.lifecycle.transition(id, WorkOrderStatus.Assigned, by);
    await this.reports?.onWorkOrderAssigned(id); // 5.2.6 — linked reports become Actioned
    await this.notifier?.notify(crewId, `You have been assigned work order ${id}.`); // 8.2.4
    if (previous !== null && previous !== crewId) {
      await this.notifier?.notify(previous, `Work order ${id} has been reassigned.`); // 8.2.6
    }
    return assigned;
  }

  /**
   * 8.2.5 — reassignment from Assigned, Accepted or In Progress. It is the same call as `assign`:
   * the state table already carries those three rules, so a separate method would be a second
   * place for the same policy to drift.
   */
  reassign(id: Uuid, crewId: Uuid, by: Principal, isActiveAccount = true): Promise<WorkOrder> {
    return this.assign(id, crewId, by, isActiveAccount);
  }

  /**
   * 8.3.13, 8.3.18, 8.3.21. The reason is written before the transition because the guard reads it.
   */
  async cancel(id: Uuid, reason: string, by: Principal): Promise<WorkOrder> {
    await this.ac.authorise(by, 'workOrder:write', { kind: 'workOrder', id });
    if (reason.trim() === '') {
      throw new TransitionRefused(WorkOrderStatus.Created, WorkOrderStatus.Cancelled, 'a cancellation requires a reason (8.3.18)');
    }
    const workOrder = await this.requireOrder(id);
    workOrder.cancellationReason = reason;
    await this.workOrders.save(workOrder);
    await this.audit?.appendAction(by.accountId, 'workOrder:cancellationReason', 'WorkOrder', id); // 2.4.1
    const cancelled = await this.lifecycle.transition(id, WorkOrderStatus.Cancelled, by);
    // 8.3.21 — every linked report returns to the status it held before this work order took it.
    await this.reports?.onWorkOrderCancelled(id);
    return cancelled;
  }

  /** 8.2.2 — each candidate's open work-order count, shown at the point of assignment. */
  async crewWorkload(crewIds: Uuid[]): Promise<Array<{ crewId: Uuid; openWorkOrders: number }>> {
    const out = [];
    for (const crewId of crewIds) {
      const orders = await this.workOrders.findForAssignee(crewId);
      out.push({ crewId, openWorkOrders: orders.filter((w) => !w.isTerminal()).length });
    }
    return out;
  }

  /**
   * 8.4.1, 8.4.2, 8.4.6 — a crew member sees **only** their own work orders, sorted by scheduled
   * date and then by priority tier, optionally filtered.
   *
   * The filter is applied here rather than in the screen because 8.4.1 is an access rule, not a
   * display preference: a client-side filter over everything would ship other crews' work to the
   * browser and rely on the UI to hide it.
   */
  async crewView(by: Principal, filter: 'Today' | 'Upcoming' | 'Completed' | 'All' = 'All'): Promise<WorkOrder[]> {
    await this.ac.authorise(by, 'workOrder:readAssigned', { kind: 'workOrder', ownerId: by.accountId });
    const mine = await this.workOrders.findForAssignee(by.accountId);
    const today = DispatchController.today();
    const tierRank: Record<PriorityTier, number> = { High: 0, Medium: 1, Low: 2 };

    const filtered = mine.filter((w) => {
      switch (filter) {
        case 'Today':
          return w.scheduledDate === today && !w.isTerminal();
        case 'Upcoming':
          return w.scheduledDate > today && !w.isTerminal();
        case 'Completed':
          return w.currentStatus() === WorkOrderStatus.Completed || w.currentStatus() === WorkOrderStatus.Verified;
        default:
          return true;
      }
    });

    return filtered.sort((a, b) =>
      a.scheduledDate === b.scheduledDate
        ? tierRank[a.priority] - tierRank[b.priority]
        : a.scheduledDate.localeCompare(b.scheduledDate),
    );
  }

  /**
   * 2.3.4, 8.2.x — every work order, for a manager.
   *
   * Deliberately NOT `crewView` with a wider permission. `crewView` reads
   * `findForAssignee(by.accountId)`, so a manager calling it sees the orders assigned to *them* —
   * which for a manager is none. The two views answer different questions and read different
   * store methods; collapsing them would render an empty work-order list that looked correct.
   */
  async managerView(
    by: Principal,
    filter: { status?: WorkOrderStatus; crewId?: Uuid } = {},
  ): Promise<WorkOrder[]> {
    await this.ac.authorise(by, 'workOrder:readAll', { kind: 'workOrder' });
    const tierRank: Record<PriorityTier, number> = { High: 0, Medium: 1, Low: 2 };
    return (await this.workOrders.findAll())
      .filter((w) => filter.status === undefined || w.currentStatus() === filter.status)
      .filter((w) => filter.crewId === undefined || w.assigneeId === filter.crewId)
      .sort((a, b) =>
        a.scheduledDate === b.scheduledDate
          ? tierRank[a.priority] - tierRank[b.priority]
          : a.scheduledDate.localeCompare(b.scheduledDate),
      );
  }

  /** 2.3.4 — one work order, for a manager. Null rather than a throw: 404 is the caller's word. */
  async managerDetail(id: Uuid, by: Principal): Promise<WorkOrder | null> {
    await this.ac.authorise(by, 'workOrder:readAll', { kind: 'workOrder', id });
    return this.workOrders.findById(id);
  }

  /** 8.3.14 — for the dashboard's attention panel (7.5.2). */
  async overdue(now = new Date()): Promise<WorkOrder[]> {
    return (await this.workOrders.findAllOpen()).filter((w) => w.isOverdue(now));
  }

  /**
   * 8.1.13, 8.1.2 — link verified open reports to a work order, which is what makes 5.2.6, 5.2.7
   * and 8.3.21 reachable at all: the linkage hooks find reports by `workOrderId`, and nothing else
   * ever sets it.
   */
  async linkVerifiedReports(id: Uuid, reportIds: Uuid[], reports: ReportStore): Promise<void> {
    for (const reportId of reportIds) {
      const report = await reports.findById(reportId);
      if (report === null || !report.isVerified()) {
        // 8.1.13 links *verified* reports. A Submitted one has not been moderated, and linking it
        // would put an unmoderated report into the work order's evidence trail.
        continue;
      }
      report.workOrderId = id;
      await reports.save(report);
    }
  }

  /**
   * A suggestion, not a decision — 8.1.9 lets the manager edit every item. Construction-site and
   * public-place habitats point at clearance work; otherwise fogging is the default intervention.
   */
  private static suggestTask(cluster: Cluster): TaskType {
    const mix = cluster.premisesMix;
    if (mix !== undefined && mix.constructionSites.length > 0) {
      return TaskType.Inspection;
    }
    if (mix !== undefined && mix.publicPlaces.length > 0) {
      return TaskType.RefuseClearance;
    }
    return TaskType.Fogging;
  }

  private async tierOf(clusterId: Uuid): Promise<PriorityTier> {
    const latest = await this.scores.latest();
    return latest.find((s) => s.clusterId === clusterId)?.tier ?? PriorityTier.Low;
  }

  private async requireOrder(id: Uuid): Promise<WorkOrder> {
    const workOrder = await this.workOrders.findById(id);
    if (workOrder === null) {
      throw new WorkOrderNotFound(`no work order ${id}`);
    }
    return workOrder;
  }

  /** Singapore's calendar date. A planner's "today" is a date, and the host clock may be UTC. */
  static today(now = new Date()): IsoDate {
    return singaporeDate(now);
  }
}
