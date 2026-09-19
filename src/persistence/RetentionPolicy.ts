/**
 * D-Fence — the retention policy, stated once.
 *
 * Stereotype: <<persistence>>. Traces: 4.1.10, 4.1.11 (see the caveat below), 1.2.7, 1.4.3.
 *
 * `prune-history.ts` counts what it would delete and then deletes it. Those are two statements
 * about the same set of rows, and if they were written separately they would eventually disagree —
 * a dry run that reports one thing and a deletion that does another is the one failure a deletion
 * tool cannot be allowed to have. So the set is defined here, once, and both use it.
 *
 * **The policy is a proposal, not a rule in force.** 4.1.11 requires the score, tier and driver
 * breakdown of every scoring cycle to be retained as history and names no period; keeping less is
 * a change to the requirement, which needs its own number. Nothing in `server.ts` imports this.
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
