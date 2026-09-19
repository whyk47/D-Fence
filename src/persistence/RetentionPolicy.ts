/**
 * D-Fence — the retention policy, stated once.
 *
 * Stereotype: <<persistence>>. Traces: 4.1.10, 4.1.11, 4.1.22, 4.1.23, 4.1.24, 1.2.7, 1.4.3.
 *
 * `prune-history.ts` counts what it would delete and then deletes it. Those are two statements
 * about the same set of rows, and if they were written separately they would eventually disagree —
 * a dry run that reports one thing and a deletion that does another is the one failure a deletion
 * tool cannot be allowed to have. So the set is defined here, once, and both use it.
 *
 * **The policy is now a requirement.** It was a proposal until 2026-09-19, when 4.1.22 and 4.1.23
 * were added to bound the retention 4.1.11 obliges: every cycle for at least 14 days, and beyond
 * that at least one complete cycle for each day the system computed scores. 4.1.11's wording and
 * number are unchanged. 4.1.24 writes down what was previously only an `ON DELETE CASCADE` — a
 * breakdown may not be deleted apart from the score it explains.
 *
 * Nothing in `server.ts` imports this, and that is still deliberate: a bounded history is a
 * requirement, but deleting on a five-minute timer alongside the scoring cycle is not what it
 * requires. See the head of `prune-history.ts`.
 */

/** Every cycle is kept this far back. Beyond it, one cycle per UTC day survives. */
export const KEEP_EVERY_CYCLE_DAYS = 14;
/** The longest window any driver reads is 72 hours (1.2.7, 1.2.8). This is a generous margin. */
export const KEEP_READINGS_DAYS = 30;
/** 1.4.3 judges a source stale from recent runs. A month of them is more than it looks at. */
export const KEEP_RUNS_DAYS = 30;

/**
 * The scoring cycles that a bounded history would drop: older than the window, and not the last
 * cycle of their own UTC day.
 *
 * `$1` is the window in days. The last cycle of a day is kept rather than the first because it is
 * the one that saw the most of that day's reports and rainfall — a day represented by its 00:04
 * cycle is represented by a cycle that had almost nothing to score.
 *
 * `driver_contribution` is not named anywhere here. It follows its score by ON DELETE CASCADE, so
 * the breakdown cannot outlive the score it explains or be orphaned from it (4.1.10).
 */
export const DOOMED_CYCLES = `
  WITH cycles AS (
    SELECT DISTINCT computed_at FROM priority_score
     WHERE computed_at < now() - ($1 || ' days')::interval
  ), keepers AS (
    SELECT max(computed_at) AS computed_at FROM cycles GROUP BY date_trunc('day', computed_at)
  )
  SELECT computed_at FROM cycles
   WHERE computed_at NOT IN (SELECT computed_at FROM keepers)`;
