/**
 * D-Fence — the retention policy, as a tool that has to be asked twice.
 *
 *     npx tsx src/tools/prune-history.ts            # counts what it would delete, deletes nothing
 *     npx tsx src/tools/prune-history.ts --apply    # deletes it
 *
 * `capacity-check.ts` says the database fills in about 45 days because nothing here ever deletes
 * anything. This is the other half: what a bounded history looks like, and what it costs.
 *
 * **It is not wired into the scheduler and must not be.** `server.ts` runs the scoring cycle every
 * five minutes without being asked; a deletion that ran on the same terms would be a process that
 * destroys history on a timer, and the first time its window was miscomputed it would take the
 * history with it before anyone read the log. Retention is a decision, so this is a command.
 *
 * ## The policy
 *
 * 4.1.11 requires the score, tier and driver breakdown of *every* scoring cycle to be retained as
 * history and names no period, which read literally forbids this tool. It was not wrong so much as
 * unbounded: what it protects is the ability to see how a locality's priority moved over time, and
 * 288 cycles a day is far finer than any question anyone asks of it. **4.1.22 and 4.1.23 were added
 * on 2026-09-19 to bound it**, leaving 4.1.11's number and wording untouched.
 *
 * So the policy keeps the *shape* of the history and drops its resolution:
 *
 *   - every cycle inside the recent window (default 14 days) — the period anyone actually
 *     investigates, where "what did it say at 3pm" is a real question;
 *   - beyond it, the **last cycle of each UTC day**, so every day that the system ran is still
 *     represented by a real, complete cycle rather than by an average of several;
 *   - `driver_contribution` follows its score by ON DELETE CASCADE, which is why 4.1.10's breakdown
 *     never separates from the score it explains.
 *
 * That is roughly a 95% reduction in the growth rate. The dry run remains the default anyway: the
 * requirement says what must be *kept*, and nothing obliges anyone to delete the rest today.
 *
 * Rainfall and ingestion runs are a different argument and carry no such requirement. The rainfall
 * driver reaches back 72 hours (1.2.7, 1.2.8) and nothing reads further; source health (1.4.3)
 * reads recent runs. Both defaults here are far longer than either needs.
 */
import { ConfigLoader } from '../config/ConfigLoader';
import { Database } from '../persistence/Database';
import {
  DOOMED_CYCLES,
  KEEP_EVERY_CYCLE_DAYS,
  KEEP_READINGS_DAYS,
  KEEP_RUNS_DAYS,
} from '../persistence/RetentionPolicy';

/**
 * Deleted in batches rather than in one statement. A single DELETE of a million rows holds locks
 * for its whole duration and rolls the entire thing back if it fails at the end; a batch that
 * fails has still done the rows before it, and the tool can simply be run again.
 */
const BATCH = 5_000;

type Query = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

function mb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const db = new Database(ConfigLoader.load().get('DATABASE_URL'));
  const q: Query = async (sql, params) => (await db.query(sql, params)) as Record<string, unknown>[];

  const before = Number((await q('SELECT pg_database_size(current_database()) b'))[0]?.b ?? 0);
  console.log(`\n  ${apply ? 'APPLYING' : 'DRY RUN — nothing will be deleted'}`);
  console.log(`  database: ${mb(before)}\n`);

  // --- what goes ---------------------------------------------------------------------------
  const cycles = await q(
    `SELECT count(*) n, min(computed_at) oldest, max(computed_at) newest FROM (${DOOMED_CYCLES}) d`,
    [KEEP_EVERY_CYCLE_DAYS],
  );
  const scoreRows = await q(
    `SELECT count(*) n FROM priority_score
      WHERE computed_at IN (SELECT computed_at FROM (${DOOMED_CYCLES}) d)`,
    [KEEP_EVERY_CYCLE_DAYS],
  );
  const kept = await q(
    `SELECT count(DISTINCT computed_at) n FROM priority_score
      WHERE computed_at >= now() - ($1 || ' days')::interval`,
    [KEEP_EVERY_CYCLE_DAYS],
  );
  const keptDaily = await q(
    `SELECT count(*) n FROM (
       SELECT max(computed_at) FROM priority_score
        WHERE computed_at < now() - ($1 || ' days')::interval
        GROUP BY date_trunc('day', computed_at)) k`,
    [KEEP_EVERY_CYCLE_DAYS],
  );
  const readings = await q(
    `SELECT count(*) n FROM rainfall_reading WHERE reading_at < now() - ($1 || ' days')::interval`,
    [KEEP_READINGS_DAYS],
  );
  const runs = await q(
    `SELECT count(*) n FROM ingestion_run WHERE started_at < now() - ($1 || ' days')::interval`,
    [KEEP_RUNS_DAYS],
  );

  console.log(`  priority_score   ${String(scoreRows[0]?.n ?? 0).padStart(9)} rows in ${cycles[0]?.n ?? 0} cycles`);
  console.log(`                   (driver_contribution follows by cascade — 4.1.10)`);
  console.log(`  rainfall_reading ${String(readings[0]?.n ?? 0).padStart(9)} rows older than ${KEEP_READINGS_DAYS} days`);
  console.log(`  ingestion_run    ${String(runs[0]?.n ?? 0).padStart(9)} rows older than ${KEEP_RUNS_DAYS} days\n`);
  console.log(`  kept: every one of ${kept[0]?.n ?? 0} cycles inside ${KEEP_EVERY_CYCLE_DAYS} days,`);
  console.log(`        plus ${keptDaily[0]?.n ?? 0} daily cycles beyond it`);
  if (cycles[0]?.oldest) {
    console.log(`  span of the cycles being thinned: ${String(cycles[0]?.oldest).slice(0, 10)} to ${String(cycles[0]?.newest).slice(0, 10)}`);
  }

  if (!apply) {
    console.log('\n  Nothing was deleted. Re-run with --apply to delete it.');
    console.log('  What it would keep is what 4.1.22 and 4.1.23 require; what it would delete is');
    console.log('  history those requirements do not oblige anyone to hold.\n');
    await db.close?.();
    return;
  }

  // --- the deletion ------------------------------------------------------------------------
  let removed = 0;
  for (;;) {
    const batch = await q(
      `DELETE FROM priority_score WHERE id IN (
         SELECT id FROM priority_score
          WHERE computed_at IN (SELECT computed_at FROM (${DOOMED_CYCLES}) d)
          LIMIT ${BATCH})
       RETURNING id`,
      [KEEP_EVERY_CYCLE_DAYS],
    );
    removed += batch.length;
    if (batch.length > 0) {
      process.stdout.write(`\r  priority_score: ${removed} rows deleted`);
    }
    if (batch.length < BATCH) {
      break;
    }
  }
  console.log(`\r  priority_score: ${removed} rows deleted        `);

  const r1 = await q(
    `DELETE FROM rainfall_reading WHERE reading_at < now() - ($1 || ' days')::interval RETURNING station_id`,
    [KEEP_READINGS_DAYS],
  );
  console.log(`  rainfall_reading: ${r1.length} rows deleted`);
  const r2 = await q(
    `DELETE FROM ingestion_run WHERE started_at < now() - ($1 || ' days')::interval RETURNING id`,
    [KEEP_RUNS_DAYS],
  );
  console.log(`  ingestion_run: ${r2.length} rows deleted`);

  // Postgres does not return deleted space to the filesystem on its own, and a report that read
  // pg_database_size straight after a DELETE would say the tool had achieved nothing.
  console.log('\n  VACUUMing so the space is actually reusable...');
  for (const t of ['priority_score', 'driver_contribution', 'rainfall_reading', 'ingestion_run']) {
    await q(`VACUUM (ANALYZE) ${t}`);
  }

  const after = Number((await q('SELECT pg_database_size(current_database()) b'))[0]?.b ?? 0);
  console.log(`\n  database: ${mb(before)} → ${mb(after)} (${mb(before - after)} reclaimed)\n`);
  await db.close?.();
}

main().catch((error: unknown) => {
  console.error(`prune-history failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
