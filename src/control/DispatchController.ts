/**
 * D-Fence — deciding what work should exist and who does it.
 * Stereotype: <<control>>. Realises use cases 6.1, 6.2, 6.3, 6.9; 8.1.x, 8.2.x.
 *
 * Assignment, reassignment and cancellation are status changes, so this class does NOT write
 * WorkOrder.status. It calls WorkOrderLifecycleController, which validates against the state
 * table first. Requirement 8.3.2 is then enforced in exactly one place — the Lab 2 adversarial
 * review found a version of this model that claimed one owner of the state machine and drew two.
 */
import { Uuid, IsoDate } from '../entity/valueTypes';
import { WorkOrder } from '../entity/WorkOrder';
import { WorkOrderRepository } from '../persistence/WorkOrderRepository';
import { ReportRepository } from '../persistence/ReportRepository';
import { WorkOrderLifecycleController } from './WorkOrderLifecycleController';
import { Principal } from './Principal';

type WorkOrderDraft = unknown;
type DispatchProposal = unknown;

export class DispatchController {
  constructor(
    private readonly lifecycle: WorkOrderLifecycleController,
    private readonly workOrders: WorkOrderRepository,
    private readonly reports: ReportRepository,
  ) {}

  /** 8.1.x: the day's suggested work, drawn from the current ranking. */
  proposeDailyList(_date: IsoDate): Promise<DispatchProposal> {
    throw new Error('not implemented');
  }

  /** 8.3.15 sets the initial status to Created — creation is not a transition. */
  createWorkOrder(_draft: WorkOrderDraft, _by: Principal): Promise<WorkOrder> {
    throw new Error('not implemented');
  }

  /** 8.1.x. Links verified open reports; 8.1.2 also records the report it was raised from. */
  linkVerifiedReports(_id: Uuid, _reportIds: Uuid[]): Promise<void> {
    throw new Error('not implemented');
  }

  /** Delegates: Created → Assigned. Also notifies the crew member (8.2.4). */
  assign(_id: Uuid, _crewId: Uuid, _by: Principal): Promise<WorkOrder> {
    throw new Error('not implemented');
  }

  /** Delegates: Assigned/Accepted/In Progress → Assigned. */
  reassign(_id: Uuid, _crewId: Uuid, _by: Principal): Promise<WorkOrder> {
    throw new Error('not implemented');
  }

  /**
   * Delegates: → Cancelled, reason required (8.3.18). Then 8.3.21 — every report linked to the
   * cancelled work order returns to the status it held before the work order was created,
   * otherwise it stays Actioned for ever while the breeding site still exists.
   */
  cancel(_id: Uuid, _reason: string, _by: Principal): Promise<WorkOrder> {
    throw new Error('not implemented');
  }
}
