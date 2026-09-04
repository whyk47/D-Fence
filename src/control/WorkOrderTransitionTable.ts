/**
 * D-Fence — the work-order state table, as data.
 * Stereotype: <<control>> (coordinator). Traces: REQUIREMENTS.md 8.3.1–8.3.21.
 *
 * This is requirement 8.3.2 expressed directly: "only the state transitions defined in the
 * work-order state table" — so the table is the table, not eight State subclasses that are
 * collectively equivalent to it. See lab3/DESIGN-MODEL.md §4 for why the GoF State pattern was
 * considered and rejected.
 *
 * Every rule carries the requirement number that permits it. That is the requirement → design →
 * code → test chain made literal: the Lab 4 basis-path tests are named after requirements.
 */
import { Role, WorkOrderStatus } from '../entity/enums';
import { WorkOrder } from '../entity/WorkOrder';
import { CompletionEvidence } from '../entity/CompletionEvidence';

/**
 * A guard answers "does this work order's own state permit the move", given the evidence attached
 * to the current completion attempt. Evidence is passed in rather than fetched, so the table stays
 * a pure function of state — the property that makes it path-testable (Lab 4 §3.1).
 */
export type Guard = (wo: WorkOrder, evidence: CompletionEvidence | null) => boolean;

export interface TransitionRule {
  readonly from: WorkOrderStatus;
  readonly to: WorkOrderStatus;
  readonly actor: Role;
  /** True when the transition is additionally permitted by the work order's own state. */
  readonly guard: Guard;
  /** The requirement that permits this transition. */
  readonly requirement: string;
  /** True when only the *assigned* crew member may make the move (8.3.4, 8.3.5, 8.3.6, 8.3.20). */
  readonly assigneeOnly: boolean;
}

const ALWAYS: Guard = () => true;

/**
 * 8.3.6, 8.3.7 — a completion timestamp, a task-performed confirmation, at least one photograph and
 * notes. 8.3.7 singles out the photograph, so the missing-photo case is the one a test names.
 */
const HAS_EVIDENCE: Guard = (_wo, evidence) =>
  evidence !== null &&
  evidence.photoKeys.length > 0 &&
  evidence.notes.trim().length > 0 &&
  evidence.taskPerformed !== undefined &&
  evidence.completedAt instanceof Date;

/** Cancellation carries a reason (8.3.18). */
const HAS_CANCELLATION_REASON: Guard = (wo) => wo.cancellationReason !== null && wo.cancellationReason !== '';

/**
 * A rejected completion carries a reason (8.3.10). The reason lives on the CompletionEvidence, not
 * on the WorkOrder — a work order can be rejected, resumed and re-completed, so the reason belongs
 * to the attempt it refers to.
 */
const HAS_REJECTION_REASON: Guard = (_wo, evidence) =>
  evidence !== null && evidence.rejectionReason !== null && evidence.rejectionReason.trim().length > 0;

/**
 * What to tell a person when a guard refuses.
 *
 * A refused guard used to produce `the conditions of 8.3.6, 8.3.7 are not met` — a requirement
 * identifier, shown to a field crew member on the single most important action they perform. The
 * requirement number belongs in the traceability, not in the sentence someone reads standing over a
 * drain. The moderation path already got this right ("a reason of at least ten characters is
 * required"); this is the same sentence in the same shape.
 *
 * Keyed off the guard itself rather than added to every row, so a guard cannot acquire a second,
 * differently-worded explanation by being reused on a new transition.
 */
const UNMET: ReadonlyMap<Guard, string> = new Map([
  [HAS_EVIDENCE, 'a completion needs at least one photograph and a note describing what was done'],
  [HAS_CANCELLATION_REASON, 'a cancellation needs a reason'],
  [HAS_REJECTION_REASON, 'sending a completion back needs a reason the crew can act on'],
]);

/** ALWAYS never fails, so it has no entry; the fallback covers a guard added without a sentence. */
export const explainUnmetGuard = (guard: Guard): string =>
  UNMET.get(guard) ?? 'this work order is not in a state that permits the change';

export class WorkOrderTransitionTable {
  private readonly permitted: TransitionRule[] = [
    // Creation is not a transition — 8.3.15 sets the initial status. It is not in this table.
    { from: WorkOrderStatus.Created, to: WorkOrderStatus.Assigned, actor: Role.OperationsManager, guard: ALWAYS, requirement: '8.2.1', assigneeOnly: false },
    { from: WorkOrderStatus.Created, to: WorkOrderStatus.Cancelled, actor: Role.OperationsManager, guard: HAS_CANCELLATION_REASON, requirement: '8.3.13, 8.3.18', assigneeOnly: false },

    { from: WorkOrderStatus.Assigned, to: WorkOrderStatus.Accepted, actor: Role.CleaningCrew, guard: ALWAYS, requirement: '8.3.4', assigneeOnly: true },
    { from: WorkOrderStatus.Assigned, to: WorkOrderStatus.Assigned, actor: Role.OperationsManager, guard: ALWAYS, requirement: '8.2.5', assigneeOnly: false },
    { from: WorkOrderStatus.Assigned, to: WorkOrderStatus.Cancelled, actor: Role.OperationsManager, guard: HAS_CANCELLATION_REASON, requirement: '8.3.13, 8.3.18', assigneeOnly: false },

    { from: WorkOrderStatus.Accepted, to: WorkOrderStatus.InProgress, actor: Role.CleaningCrew, guard: ALWAYS, requirement: '8.3.5, 8.3.17', assigneeOnly: true },
    { from: WorkOrderStatus.Accepted, to: WorkOrderStatus.Assigned, actor: Role.OperationsManager, guard: ALWAYS, requirement: '8.2.5', assigneeOnly: false },
    { from: WorkOrderStatus.Accepted, to: WorkOrderStatus.Cancelled, actor: Role.OperationsManager, guard: HAS_CANCELLATION_REASON, requirement: '8.3.13, 8.3.18', assigneeOnly: false },

    { from: WorkOrderStatus.InProgress, to: WorkOrderStatus.Completed, actor: Role.CleaningCrew, guard: HAS_EVIDENCE, requirement: '8.3.6, 8.3.7', assigneeOnly: true },
    { from: WorkOrderStatus.InProgress, to: WorkOrderStatus.Assigned, actor: Role.OperationsManager, guard: ALWAYS, requirement: '8.2.5', assigneeOnly: false },
    { from: WorkOrderStatus.InProgress, to: WorkOrderStatus.Cancelled, actor: Role.OperationsManager, guard: HAS_CANCELLATION_REASON, requirement: '8.3.13, 8.3.18', assigneeOnly: false },

    { from: WorkOrderStatus.Completed, to: WorkOrderStatus.Verified, actor: Role.OperationsManager, guard: ALWAYS, requirement: '8.3.9, 8.3.12', assigneeOnly: false },
    { from: WorkOrderStatus.Completed, to: WorkOrderStatus.Rejected, actor: Role.OperationsManager, guard: HAS_REJECTION_REASON, requirement: '8.3.9, 8.3.10', assigneeOnly: false },

    { from: WorkOrderStatus.Rejected, to: WorkOrderStatus.InProgress, actor: Role.CleaningCrew, guard: ALWAYS, requirement: '8.3.19, 8.3.20', assigneeOnly: true },

    // Verified and Cancelled are terminal (8.3.x state table). Their absence here is the rule.
  ];

  rulesFrom(status: WorkOrderStatus): TransitionRule[] {
    return this.permitted.filter((r) => r.from === status);
  }

  find(from: WorkOrderStatus, to: WorkOrderStatus, actor: Role): TransitionRule | undefined {
    return this.permitted.find((r) => r.from === from && r.to === to && r.actor === actor);
  }

  /** Verified and Cancelled — no rule leaves them. */
  isTerminal(status: WorkOrderStatus): boolean {
    return this.rulesFrom(status).length === 0;
  }
}
