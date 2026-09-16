/**
 * D-Fence — Lab 4 §3.2.2: basis-path tests for two methods handling complex logic.
 *
 * Subject 1: WorkOrderLifecycleController.isTransitionPermitted, via WorkOrderTransitionTable.find.
 * Subject 2: PriorityRanking.rank, whose comparator implements 4.1.14's ordering. Renamed from
 * ClusterRanking in v0.9, when the tie-break changed from case size — which exists for the
 * mosquito alone — to severity multiplier, then verified open report count, then locality.
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
import { PriorityRanking, RankingKey } from '../src/control/PriorityRanking';
import { PriorityScore } from '../src/entity/PriorityScore';
import { PestType } from '../src/entity/enums';

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

function score(clusterId: string, value: number, pestType = PestType.Mosquito): PriorityScore {
  const s = new PriorityScore();
  Object.assign(s, {
    id: `score-${clusterId}`,
    clusterId,
    localityId: clusterId,
    pestType,
    computedAt: new Date('2026-09-03T00:00:00Z'),
    score: value,
    tier: PriorityTier.Medium,
    isDegraded: false,
    excludedDrivers: [],
    rank: 0,
  });
  return s;
}

/**
 * 4.1.14 as revised. The first argument was case size in v0.8 and is the severity multiplier now;
 * the report count is the second key. Defaulted so the cases that do not exercise it read as they
 * did — R2 and R5 are about score and stability, not about tie-breaks.
 */
const key = (
  severityMultiplier: number,
  locality: string,
  verifiedOpenReportCount = 0,
): RankingKey => ({ severityMultiplier, verifiedOpenReportCount, locality });

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
 * SUBJECT 2 — PriorityRanking.rank. Decision points: the sort iteration, the Critical comparison,
 * the score comparison, the two missing-key conditions, the severity comparison, the report-count
 * comparison, and the rank-assignment iteration. V(G) = 8, so eight independent paths — v0.8 had
 * six, and v0.9 adds R7 (Critical outranks a higher score) and R8 (the report-count key).
 */
describe('Basis path: PriorityRanking.rank (4.1.14, 4.4.4)', () => {
  it('R1 — empty ranking: neither loop body executes', () => {
    const r = new PriorityRanking();
    expect(() => r.rank()).not.toThrow();
    expect(r.size()).toBe(0);
  });

  it('R2 — scores differ: ordered by score descending, no tie-break consulted', () => {
    const r = new PriorityRanking();
    r.add(score('a', 40), key(1.0, 'Zebra Road'));
    r.add(score('b', 90), key(1.0, 'Alpha Road'));
    r.rank();
    expect(r.top(2).map((s) => s.clusterId)).toEqual(['b', 'a']);
    expect(r.top(2).map((s) => s.rank)).toEqual([1, 2]);
  });

  it('R3 — scores tie, severity differs: the more severe pest ranks first', () => {
    // A rat and a termite at the same urgency are not the same case. sigma(Rat) is 1.00 and
    // sigma(Termite) 0.33, and at equal score that is the honest way to break the tie.
    const r = new PriorityRanking();
    r.add(score('termite', 60, PestType.Termite), key(0.33, 'Alpha Road'));
    r.add(score('rat', 60, PestType.Rat), key(1.0, 'Zebra Road'));
    r.rank();
    expect(r.top(2).map((s) => s.pestType)).toEqual([PestType.Rat, PestType.Termite]);
  });

  it('R4 — scores and severity tie: locality name breaks it, ascending', () => {
    const r = new PriorityRanking();
    r.add(score('z', 60), key(1.0, 'Zebra Road'));
    r.add(score('a', 60), key(1.0, 'Alpha Road'));
    r.rank();
    expect(r.top(2).map((s) => s.clusterId)).toEqual(['a', 'z']);
  });

  it('R8 — score and severity tie: the locality with more verified reports ranks first', () => {
    // The second key of 4.1.14. Two localities, same pest, same score: the one people are actually
    // complaining about goes first, because a report is a person and a driver value is not.
    const r = new PriorityRanking();
    r.add(score('quiet', 60), key(1.0, 'Alpha Road', 1));
    r.add(score('loud', 60), key(1.0, 'Zebra Road', 9));
    r.rank();
    expect(r.top(2).map((s) => s.clusterId)).toEqual(['loud', 'quiet']);
  });

  it('R7 — a Critical row outranks a higher-scoring High row (4.4.4)', () => {
    // The case the override exists for: a snake indoors scores 12 and must still be first. If this
    // fails, 4.4 has been implemented as arithmetic, which is precisely what it is not.
    const r = new PriorityRanking();
    const high = score('busy-cluster', 88);
    high.tier = PriorityTier.High;
    const critical = score('snake-indoors', 12.0, PestType.Snake);
    critical.tier = PriorityTier.Critical;
    r.add(high, key(1.0, 'Alpha Road'));
    r.add(critical, key(0.75, 'Zebra Road'));
    r.rank();
    expect(r.top(2).map((s) => s.clusterId)).toEqual(['snake-indoors', 'busy-cluster']);
    // 4.4.5 — the score is retained, not inflated to put it there.
    expect(r.top(1)[0]?.score).toBe(12.0);
  });

  it('R5 — a fully tied pair produces a stable, repeatable order', () => {
    // The dashboard refreshes on every scoring cycle. If equal clusters reshuffled between cycles
    // an Operations Manager would read it as the ranking changing when nothing had.
    const build = (): PriorityRanking => {
      const r = new PriorityRanking();
      r.add(score('x', 60), key(1.0, 'Same Road'));
      r.add(score('y', 60), key(1.0, 'Same Road'));
      return r;
    };
    const first = build();
    first.rank();
    const second = build();
    second.rank();
    expect(first.top(2).map((s) => s.clusterId)).toEqual(second.top(2).map((s) => s.clusterId));
  });

  it('R6 — a missing ranking key throws rather than emitting an order 4.1.14 does not define', () => {
    const r = new PriorityRanking();
    r.add(score('a', 60), key(1.0, 'Alpha Road'));
    // Reach past the public API to construct the defect this path guards against.
    (r as unknown as { ordered: PriorityScore[] }).ordered.push(score('orphan', 60));
    expect(() => r.rank()).toThrow(/no ranking key/);
  });

  it('byTier and top are consistent with the ranked order', () => {
    const r = new PriorityRanking();
    const high = score('h', 85);
    high.tier = PriorityTier.High;
    r.add(high, key(1.0, 'High Road'));
    r.add(score('m', 50), key(1.0, 'Mid Road'));
    r.rank();
    expect(r.byTier(PriorityTier.High).map((s) => s.clusterId)).toEqual(['h']);
    expect(r.top(1).map((s) => s.clusterId)).toEqual(['h']);
    expect(r.top(0)).toEqual([]);
  });
});
