/**
 * D-Fence — Lab 4 §3.2.2: basis-path tests for two methods handling complex logic.
 *
 * Subject 1: WorkOrderLifecycleController.isTransitionPermitted, via WorkOrderTransitionTable.find.
 * Subject 2: ClusterRanking.rank, whose comparator implements 4.1.14's three-key ordering.
 *
 * Both were chosen at design time, not found afterwards: the work-order machine is table-driven
 * rather than a GoF State hierarchy precisely so that 8.3.2 lives in one method with a bounded
 * branch structure. The path enumeration and the cyclomatic complexity working are in
 * lab4/TEST-PLAN.md §3; path ids below match that table.
 */
import { describe, expect, it } from 'vitest';
import { PriorityTier, Role, WorkOrderStatus } from '../src/entity/enums';
import { WorkOrderTransitionTable } from '../src/control/WorkOrderTransitionTable';
import { WorkOrderLifecycleController } from '../src/control/WorkOrderLifecycleController';
import { ClusterRanking, RankingKey } from '../src/control/ClusterRanking';
import { PriorityScore } from '../src/entity/PriorityScore';

function lifecycle(): WorkOrderLifecycleController {
  // isTransitionPermitted is pure: no repository, no clock, no network. That is why it is the
  // basis-path subject — a method that reaches for a database cannot be path-tested without one.
  return new WorkOrderLifecycleController(
    new WorkOrderTransitionTable(),
    null as never,
    null as never,
    null as never,
    null as never,
  );
}

function score(clusterId: string, value: number): PriorityScore {
  const s = new PriorityScore();
  Object.assign(s, {
    id: `score-${clusterId}`,
    clusterId,
    computedAt: new Date('2026-09-03T00:00:00Z'),
    score: value,
    tier: PriorityTier.Medium,
    isDegraded: false,
    excludedDrivers: [],
    rank: 0,
  });
  return s;
}

const key = (caseSize: number, locality: string): RankingKey => ({ caseSize, locality });

/**
 * SUBJECT 1 — isTransitionPermitted. Decision points: the array iteration, the three `&&`
 * conditions in the predicate, and the `!== undefined` test. V(G) = 5, so five independent paths.
 */
describe('Basis path: isTransitionPermitted (8.3.2, 8.3.3)', () => {
  const wo = lifecycle();

  it('P1 — first condition false: the `from` status does not match any rule row', () => {
    // Verified is terminal, so every row fails on r.from before the second condition is evaluated.
    expect(
      wo.isTransitionPermitted(WorkOrderStatus.Verified, WorkOrderStatus.Assigned, Role.OperationsManager),
    ).toBe(false);
  });

  it('P2 — first condition true, second false: `from` matches, `to` does not', () => {
    // Created has rules to Assigned and Cancelled, but none to Completed.
    expect(
      wo.isTransitionPermitted(WorkOrderStatus.Created, WorkOrderStatus.Completed, Role.OperationsManager),
    ).toBe(false);
  });

  it('P3 — first two true, third false: the right move attempted by the wrong role', () => {
    // Assigned -> Accepted exists, but 8.3.4 gives it to the crew member, not the manager.
    expect(
      wo.isTransitionPermitted(WorkOrderStatus.Assigned, WorkOrderStatus.Accepted, Role.OperationsManager),
    ).toBe(false);
  });

  it('P4 — all three true: a rule is found and the transition is permitted', () => {
    expect(
      wo.isTransitionPermitted(WorkOrderStatus.Assigned, WorkOrderStatus.Accepted, Role.CleaningCrew),
    ).toBe(true);
  });

  it('P5 — the iteration exhausts without a match: undefined becomes false', () => {
    // Cancelled is terminal; no row has it as `from`, so the loop completes and find returns
    // undefined, exercising the `!== undefined` branch on its false side.
    expect(
      wo.isTransitionPermitted(WorkOrderStatus.Cancelled, WorkOrderStatus.Assigned, Role.OperationsManager),
    ).toBe(false);
  });

  /**
   * P0 — the empty-table path is unreachable by construction: `permitted` is a non-empty constant
   * initialised in the field declaration. Recorded rather than tested, because a test that cannot
   * fail is not evidence. If the table ever becomes injectable, this path becomes reachable and
   * must be covered.
   */
  it('P0 — recorded as unreachable: the transition table is a non-empty constant', () => {
    const table = new WorkOrderTransitionTable();
    expect(table.rulesFrom(WorkOrderStatus.Created).length).toBeGreaterThan(0);
  });

  it('covers every non-terminal status: each has at least one permitted outgoing transition', () => {
    const table = new WorkOrderTransitionTable();
    const nonTerminal = [
      WorkOrderStatus.Created,
      WorkOrderStatus.Assigned,
      WorkOrderStatus.Accepted,
      WorkOrderStatus.InProgress,
      WorkOrderStatus.Completed,
      WorkOrderStatus.Rejected,
    ];
    nonTerminal.forEach((s) => expect(table.rulesFrom(s).length).toBeGreaterThan(0));
    // 8.3.x state table: exactly two terminal states.
    expect(table.isTerminal(WorkOrderStatus.Verified)).toBe(true);
    expect(table.isTerminal(WorkOrderStatus.Cancelled)).toBe(true);
  });

  it('every rule carries the requirement number that permits it (traceability)', () => {
    const table = new WorkOrderTransitionTable();
    const all = Object.values(WorkOrderStatus).flatMap((s) => table.rulesFrom(s));
    expect(all.length).toBeGreaterThan(0);
    all.forEach((rule) => {
      // A placeholder such as "8.2.x" is not a requirement number. An earlier version of the table
      // carried four of them; an adversarial review caught it. This test is why it cannot recur.
      expect(rule.requirement).toMatch(/^\d+\.\d+\.\d+(,\s*\d+\.\d+\.\d+)*$/);
    });
  });
});

/**
 * SUBJECT 2 — ClusterRanking.rank. Decision points: the sort iteration, the score comparison, the
 * two missing-key conditions, the case-size comparison, and the rank-assignment iteration.
 * V(G) = 6, so six independent paths.
 */
describe('Basis path: ClusterRanking.rank (4.1.14)', () => {
  it('R1 — empty ranking: neither loop body executes', () => {
    const r = new ClusterRanking();
    expect(() => r.rank()).not.toThrow();
    expect(r.size()).toBe(0);
  });

  it('R2 — scores differ: ordered by score descending, no tie-break consulted', () => {
    const r = new ClusterRanking();
    r.add(score('a', 40), key(1, 'Zebra Road'));
    r.add(score('b', 90), key(1, 'Alpha Road'));
    r.rank();
    expect(r.top(2).map((s) => s.clusterId)).toEqual(['b', 'a']);
    expect(r.top(2).map((s) => s.rank)).toEqual([1, 2]);
  });

  it('R3 — scores tie, case sizes differ: the larger cluster ranks first', () => {
    const r = new ClusterRanking();
    r.add(score('small', 60), key(3, 'Alpha Road'));
    r.add(score('big', 60), key(30, 'Zebra Road'));
    r.rank();
    expect(r.top(2).map((s) => s.clusterId)).toEqual(['big', 'small']);
  });

  it('R4 — scores and case sizes tie: locality name breaks it, ascending', () => {
    const r = new ClusterRanking();
    r.add(score('z', 60), key(10, 'Zebra Road'));
    r.add(score('a', 60), key(10, 'Alpha Road'));
    r.rank();
    expect(r.top(2).map((s) => s.clusterId)).toEqual(['a', 'z']);
  });

  it('R5 — a fully tied pair produces a stable, repeatable order', () => {
    // The dashboard refreshes on every scoring cycle. If equal clusters reshuffled between cycles
    // an Operations Manager would read it as the ranking changing when nothing had.
    const build = (): ClusterRanking => {
      const r = new ClusterRanking();
      r.add(score('x', 60), key(10, 'Same Road'));
      r.add(score('y', 60), key(10, 'Same Road'));
      return r;
    };
    const first = build();
    first.rank();
    const second = build();
    second.rank();
    expect(first.top(2).map((s) => s.clusterId)).toEqual(second.top(2).map((s) => s.clusterId));
  });

  it('R6 — a missing ranking key throws rather than emitting an order 4.1.14 does not define', () => {
    const r = new ClusterRanking();
    r.add(score('a', 60), key(10, 'Alpha Road'));
    // Reach past the public API to construct the defect this path guards against.
    (r as unknown as { ordered: PriorityScore[] }).ordered.push(score('orphan', 60));
    expect(() => r.rank()).toThrow(/no ranking key/);
  });

  it('byTier and top are consistent with the ranked order', () => {
    const r = new ClusterRanking();
    const high = score('h', 85);
    high.tier = PriorityTier.High;
    r.add(high, key(20, 'High Road'));
    r.add(score('m', 50), key(5, 'Mid Road'));
    r.rank();
    expect(r.byTier(PriorityTier.High).map((s) => s.clusterId)).toEqual(['h']);
    expect(r.top(1).map((s) => s.clusterId)).toEqual(['h']);
    expect(r.top(0)).toEqual([]);
  });
});
