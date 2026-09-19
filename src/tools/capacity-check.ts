/**
 * D-Fence — how long the database has left before it fills.
 *
 *     npx tsx src/tools/capacity-check.ts [capMb]
 *
 * **Read-only. This tool deletes nothing and is not allowed to.** It answers one question: at the
 * rate this system is currently writing, on what date does the database hit its size limit?
 *
 * The question needs asking because nothing in D-Fence ever deletes anything. 4.1.11 requires the
 * score, tier and driver breakdown of *every* scoring cycle to be retained as history, and states
 * no period — so the correct implementation of the requirement as written is unbounded growth. The
 * scoring cycle runs every five minutes, and each cycle writes one row per scored subject plus five
 * to seven driver contributions for each of them. Three pests currently reach a score; the
 * configuration names 22. The growth is linear in cycles and in pests, and neither is bounded.
 *
 * Egress was the constraint that nearly stopped this project on 2026-09-17 and it was fixed by
 * making a query cheaper. Disk cannot be fixed that way: it is not the cost of a query but the
 * accumulated cost of every cycle that has ever run, and the only levers are retention and plan.
 *
 * Growth is measured from the data's own timestamps over a trailing window, not assumed. Bytes per
 * row come from `pg_total_relation_size` divided by the live row count, so indexes and TOAST are
 * included — a projection that counted only the tuples would be optimistic by roughly the size of
 * the indexes, which on `driver_contribution` is most of the table.
 */
import { ConfigLoader } from '../config/ConfigLoader';
import { Database } from '../persistence/Database';
import {
  KEEP_EVERY_CYCLE_DAYS,
  KEEP_READINGS_DAYS,
  KEEP_RUNS_DAYS,
} from '../persistence/RetentionPolicy';

/**
 * Supabase's free tier: 500 MB of database disk. Passed as an argument when the project moves to a
 * plan with a different one, so that the number in this file is never silently wrong.
 */
const DEFAULT_CAP_MB = 500;

/**
 * Growth is reported over two windows, and the pair matters more than either number.
 *
 * Seven days is long enough to survive a quiet day, and on this system it also contains a ten-hour
 * outage on 16-17 September during which nothing was scored, and several days on which only one
 * pest reached a score. A trailing week therefore *understates* the rate the system runs at today.
 * One day is noisy but current. When the two disagree, the shorter one is the one to plan against.
 */
const WINDOWS = [7, 1];

/** The tables that grow with the cycle rather than with the world. */
const GROWING: Array<{ table: string; column: string; note: string }> = [
  { table: 'priority_score', column: 'computed_at', note: 'one row per scored subject per cycle' },
  { table: 'driver_contribution', column: '', note: 'five to seven rows per score' },
  { table: 'rainfall_reading', column: 'reading_at', note: 'one row per station per feed poll' },
  { table: 'ingestion_run', column: 'started_at', note: 'one row per source per poll' },
  { table: 'audit_record', column: 'occurred_at', note: '2.4.1 — grows with use, not with time' },
];

function mb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

async function main(): Promise<void> {
  const capMb = Number(process.argv[2] ?? DEFAULT_CAP_MB);
  const db = new Database(ConfigLoader.load().get('DATABASE_URL'));
  const q = async (sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> =>
    (await db.query(sql, params)) as Record<string, unknown>[];

  const total = Number((await q('SELECT pg_database_size(current_database()) b'))[0]?.b ?? 0);
  const cap = capMb * 1_048_576;

  console.log(`\nDatabase: ${mb(total)} of ${capMb} MB (${((total / cap) * 100).toFixed(1)}%)\n`);

  console.log('  table                 size      rows      B/row   rows/day    MB/day');
  const totals = new Map<number, number>();
  /** Per-table daily bytes at the current rate, for the steady-state estimate below. */
  const perTable = new Map<string, number>();
  for (const windowDays of WINDOWS) {
    totals.set(windowDays, 0);
  }
  for (const g of GROWING) {
    const sized = await q(
      `SELECT pg_total_relation_size($1::regclass) bytes,
              (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = $2) rows`,
      [g.table, g.table],
    );
    const bytes = Number(sized[0]?.bytes ?? 0);
    const rows = Number(sized[0]?.rows ?? 0);
    if (rows === 0) {
      continue;
    }
    const perRow = bytes / rows;

    // `driver_contribution` has no timestamp of its own — it is written with its score and in the
    // same transaction, so its rate is the score rate times the rows each score carries. Asking the
    // table for a date it does not have would mean either joining 500,000 rows to get a number that
    // is already implied, or inventing one.
    const rates = new Map<number, number>();
    for (const windowDays of WINDOWS) {
      rates.set(windowDays, await rowsPerDay(q, g, windowDays));
    }
    const current = rates.get(WINDOWS[WINDOWS.length - 1] as number) ?? 0;
    perTable.set(g.table, current * perRow);
    for (const windowDays of WINDOWS) {
      const rate = rates.get(windowDays) ?? 0;
      totals.set(windowDays, (totals.get(windowDays) ?? 0) + rate * perRow);
    }
    console.log(
      `  ${g.table.padEnd(20)} ${mb(bytes).padStart(8)} ${String(rows).padStart(9)} ` +
        `${perRow.toFixed(0).padStart(7)} ${current.toFixed(0).padStart(10)} ` +
        `${((current * perRow) / 1_048_576).toFixed(2).padStart(9)}`,
    );
  }

  console.log('');
  for (const windowDays of WINDOWS) {
    const bytesPerDay = totals.get(windowDays) ?? 0;
    const label = `last ${windowDays} day${windowDays === 1 ? '' : 's'}`;
    if (bytesPerDay <= 0) {
      console.log(`  ${label.padEnd(12)} no growth measured — nothing ran, or the window is empty.`);
      continue;
    }
    const days = (cap - total) / bytesPerDay;
    const when = new Date(Date.now() + days * 86_400_000);
    console.log(
      `  ${label.padEnd(12)} ${(bytesPerDay / 1_048_576).toFixed(2).padStart(6)} MB/day  ` +
        `→ ${days.toFixed(0).padStart(3)} days left, full on ${when.toISOString().slice(0, 10)}`,
    );
  }

  /**
   * The same arithmetic with the retention policy applied — which is the number to plan against,
   * because the projections above assume nothing is ever deleted and 4.1.22 to 4.1.24 now say
   * otherwise.
   *
   * In steady state the window holds a fixed amount: 14 days of every cycle, 30 days of readings
   * and runs, plus one archived cycle for each older day. Growth then is not the daily write rate
   * but only that archive — roughly a three-hundredth of it.
   *
   * **This only holds if someone runs `prune-history --apply`.** It is a command and not a
   * scheduled job, deliberately (see that tool's head), so the bound is a decision repeated rather
   * than a property of the system. A database that is never pruned grows at the rate above no
   * matter what the requirements say.
   */
  const scoreBytes = (perTable.get('priority_score') ?? 0) + (perTable.get('driver_contribution') ?? 0);
  const steadyState =
    KEEP_EVERY_CYCLE_DAYS * scoreBytes +
    KEEP_READINGS_DAYS * (perTable.get('rainfall_reading') ?? 0) +
    KEEP_RUNS_DAYS * (perTable.get('ingestion_run') ?? 0);
  const cyclesPerDay = await q(
    `SELECT count(DISTINCT computed_at)::numeric n FROM priority_score
      WHERE computed_at > now() - interval '1 day'`,
  );
  const perCycle = Number(cyclesPerDay[0]?.n ?? 0) > 0 ? scoreBytes / Number(cyclesPerDay[0]?.n) : 0;
  console.log('');
  console.log('  with the retention policy applied and re-applied (4.1.22-4.1.24):');
  console.log(
    `  ${'steady state'.padEnd(12)} ~${(steadyState / 1_048_576).toFixed(0)} MB held, growing ` +
      `${((perCycle + (perTable.get('audit_record') ?? 0)) / 1_048_576).toFixed(3)} MB/day ` +
      `(one archived cycle per day)`,
  );
  console.log(
    `  ${''.padEnd(12)} which is ${((steadyState / cap) * 100).toFixed(0)}% of the cap, and stays there.`,
  );
  console.log('  That bound holds only while someone runs prune-history --apply. It is a command,');
  console.log('  not a scheduled job — so the bound is a decision repeated, not a property.');

  // Linear in pests as well as in cycles, and this is the part a projection hides: the rates above
  // are the rates for the pests that currently reach a score, not for the ones configured.
  const pests = await q(
    `SELECT count(DISTINCT pest_type) n FROM priority_score
      WHERE computed_at = (SELECT max(computed_at) FROM priority_score)`,
  );
  console.log(
    `
  Scored in the last cycle: ${pests[0]?.n ?? '?'} pest type(s), of 22 configured.
` +
      `  Every rate above scales with that count. It is a floor, not a ceiling.
`,
  );

  await db.close?.();
}

type Query = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/** Rows written per day, measured from the data's own timestamps over a trailing window. */
async function rowsPerDay(
  q: Query,
  g: { table: string; column: string },
  windowDays: number,
): Promise<number> {
  if (g.column === '') {
    const ratio = await q(
      `SELECT (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'driver_contribution')::numeric
            / NULLIF((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'priority_score'), 0) r`,
    );
    const scoreRate = await q(
      `SELECT count(*)::numeric / $1 r FROM priority_score
        WHERE computed_at > now() - ($1 || ' days')::interval`,
      [windowDays],
    );
    return Number(ratio[0]?.r ?? 0) * Number(scoreRate[0]?.r ?? 0);
  }
  const counted = await q(
    `SELECT count(*)::numeric / $1 r FROM ${g.table}
      WHERE ${g.column} > now() - ($1 || ' days')::interval`,
    [windowDays],
  );
  return Number(counted[0]?.r ?? 0);
}

main().catch((error: unknown) => {
  console.error(`capacity-check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
