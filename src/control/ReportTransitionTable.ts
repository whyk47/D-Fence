/**
 * D-Fence — the permitted moves of a report through its status set.
 * Stereotype: <<control>>. Traces: 5.2.1–5.2.7, 8.3.21, 8.5.1.
 *
 * Same shape as `WorkOrderTransitionTable`, and for the same reason: a table can be read against
 * the requirement it came from, whereas a switch statement spread over three controllers cannot.
 *
 * The difference from the work-order table is `actor`. A report moves for two very different
 * reasons — a moderator decides (5.2.3), or a linked work order progressed (5.2.6, 5.2.7) — and
 * conflating them would let a manager mark a report Closed by hand without any work being done.
 * SYSTEM moves are reachable only from the §8 hooks, never from a route.
 */
import { ReportStatus, Role } from '../entity/enums';

/** Who is permitted to make a move. SYSTEM is not a role: it is "no human did this". */
export type ReportActor = Role.OperationsManager | 'SYSTEM';

export interface ReportTransitionRule {
  from: ReportStatus;
  to: ReportStatus;
  by: ReportActor;
  /** The requirement this row exists to satisfy, quoted back in a refusal (5.2.x). */
  requirement: string;
  /** 5.2.4 — a move that cannot be made without a reason. */
  requiresReason?: boolean;
}

const RULES: readonly ReportTransitionRule[] = [
  // 5.2.3 — moderation. The only two moves a human makes.
  { from: ReportStatus.Submitted, to: ReportStatus.Verified, by: Role.OperationsManager, requirement: '5.2.3' },
  {
    from: ReportStatus.Submitted,
    to: ReportStatus.Rejected,
    by: Role.OperationsManager,
    requirement: '5.2.3, 5.2.4',
    requiresReason: true,
  },
  // 5.2.6 — the linked work order was assigned, so the site is being dealt with.
  { from: ReportStatus.Verified, to: ReportStatus.Actioned, by: 'SYSTEM', requirement: '5.2.6' },
  // 5.2.7, 8.5.1 — the linked work order was verified complete.
  { from: ReportStatus.Actioned, to: ReportStatus.Closed, by: 'SYSTEM', requirement: '5.2.7, 8.5.1' },
  // A work order can be verified without the report having passed through Actioned — a manager may
  // verify an order that was never formally assigned in the demo path. 8.5.1 says *every* linked
  // report closes, so this row exists rather than leaving one silently stuck at Verified.
  { from: ReportStatus.Verified, to: ReportStatus.Closed, by: 'SYSTEM', requirement: '8.5.1' },
  // 8.3.21 — the work order was cancelled, so the report returns to where it was. Restoration
  // moves backwards, which is why it is a row of its own and reachable only from the cancel hook.
  { from: ReportStatus.Actioned, to: ReportStatus.Verified, by: 'SYSTEM', requirement: '8.3.21' },
];

export class ReportTransitionTable {
  find(from: ReportStatus, to: ReportStatus, by: ReportActor): ReportTransitionRule | undefined {
    return RULES.find((r) => r.from === from && r.to === to && r.by === by);
  }

  /** Rejected and Closed have no outgoing row: a settled report stays settled. */
  isTerminal(from: ReportStatus): boolean {
    return !RULES.some((r) => r.from === from);
  }

  all(): readonly ReportTransitionRule[] {
    return RULES;
  }
}
