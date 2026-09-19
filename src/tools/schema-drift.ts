/**
 * D-Fence — is the live schema what a fresh migration run would produce?
 *
 *     npx tsx src/tools/schema-drift.ts
 *
 * `migrate.ts` warns that `001_initial_schema.sql` and `002_task_type_alignment.sql` were applied
 * with a different checksum from the one they hash to now. Both were applied and then edited
 * minutes later — 001 was applied at 02:22 on 4 September and committed at 02:24; 002 applied at
 * 14:39 and committed at 14:43 — and the versions that actually ran are in no commit, so what
 * changed cannot be recovered from the history. The warning is therefore true and unhelpful: it
 * says the files differ from what ran, and nothing about whether it matters.
 *
 * The question that matters is whether a developer who clones this repository and runs `migrate`
 * ends up with the database that is in production. This answers *that*, by building the schema the
 * migrations describe and comparing it column by column and constraint by constraint against the
 * live one.
 *
 * ## Why this is safe to run against production
 *
 * Everything happens inside **one transaction that always ends in ROLLBACK**. Postgres has
 * transactional DDL, so a `CREATE TABLE` that ran inside it never existed once it rolls back. The
 * migrations are replayed into a scratch schema with `SET LOCAL search_path`, and the rollback is
 * the guarantee rather than the search path: even if a statement escaped the scratch schema and
 * altered a real table, the rollback would undo that too. There is no code path here that commits.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { ConfigLoader } from '../config/ConfigLoader';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(HERE, '..', 'persistence', 'migrations');
const CA_PATH = resolve(HERE, '..', 'certs', 'prod-ca-2021.crt');
const SCRATCH = 'schema_drift_check';

/** Columns, with the facts that change behaviour: type, nullability, default. */
const COLUMNS = `
  SELECT table_name || '.' || column_name AS k,
         data_type || ' null=' || is_nullable ||
           ' default=' || coalesce(regexp_replace(column_default, '::[a-z ]+', '', 'g'), '-') AS v
    FROM information_schema.columns WHERE table_schema = $1`;

/**
 * Constraints by their *definition* rather than their name. A CHECK that admits six sources and one
 * that admits four are the same constraint by name and different by every behaviour that matters —
 * which is exactly the difference that took the observation cycle down on 17 September.
 */
const CONSTRAINTS = `
  SELECT c.conrelid::regclass::text || ' ' || c.contype::text || ' ' ||
         pg_get_constraintdef(c.oid) AS k, '' AS v
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
   WHERE n.nspname = $1`;

const INDEXES = `
  SELECT tablename || ' ' || regexp_replace(indexdef, ' ON [a-z_]+\\.', ' ON ') AS k, '' AS v
    FROM pg_indexes WHERE schemaname = $1`;

type Inventory = Map<string, string>;

/**
 * Schema qualification is noise here, and it is noise that appears on only one side. With the
 * scratch schema first in the search path, Postgres renders a scratch table unqualified and the
 * identical public one as `public.account` — so an un-normalised comparison reports every
 * constraint in the database as drift, which is a tool that is always alarmed and therefore never
 * read. Both prefixes are stripped, from keys and values alike.
 */
function unqualify(text: string): string {
  return text.replace(new RegExp(`\\b(?:${SCRATCH}|public)\\.`, 'g'), '');
}

async function inventory(client: Client, sql: string, schema: string): Promise<Inventory> {
  const rows = (await client.query<{ k: string; v: string }>(sql, [schema])).rows;
  return new Map(rows.map((r) => [unqualify(r.k), unqualify(r.v)]));
}

/** @returns the differences, as lines ready to print. */
function compare(label: string, live: Inventory, fresh: Inventory): string[] {
  const out: string[] = [];
  for (const [k, v] of fresh) {
    if (!live.has(k)) {
      out.push(`  fresh only   ${label}  ${k}${v === '' ? '' : `  ${v}`}`);
    } else if (live.get(k) !== v) {
      out.push(`  differs      ${label}  ${k}\n      live:  ${live.get(k)}\n      fresh: ${v}`);
    }
  }
  for (const k of live.keys()) {
    if (!fresh.has(k)) {
      out.push(`  live only    ${label}  ${k}`);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const connectionString = ConfigLoader.load().get('DATABASE_URL');
  if (connectionString === '') {
    console.log('DATABASE_URL is not set.');
    return;
  }
  const client = new Client({
    connectionString,
    ssl: { ca: readFileSync(CA_PATH, 'utf8'), rejectUnauthorized: true },
  });
  await client.connect();

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const differences: string[] = [];

  try {
    await client.query('BEGIN');
    // Statement-level safety net under the transaction-level one: a replay that hangs on a lock
    // should give up rather than sit on production tables waiting.
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query(`CREATE SCHEMA ${SCRATCH}`);
    // PostGIS does not live in `public` on Supabase, and `geography` is a type the schema depends
    // on in eight columns. Asked for rather than assumed: a hard-coded `extensions` would make this
    // tool report catastrophic drift on any database that installed PostGIS somewhere else.
    const postgis = (
      await client.query<{ nspname: string }>(
        `SELECT n.nspname FROM pg_extension e
           JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'postgis'`,
      )
    ).rows[0]?.nspname;
    if (postgis === undefined) {
      throw new Error('postgis is not installed in this database');
    }
    await client.query(`SET LOCAL search_path = ${SCRATCH}, public, ${postgis}`);

    console.log(`\n  replaying ${files.length} migrations into a scratch schema...`);
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query(sql);
      } catch (error) {
        // Reported rather than thrown: a migration that cannot be replayed at all is the most
        // important thing this tool can discover, and it should be said plainly.
        console.log(`  ✗ ${file} — ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }
    console.log('  replayed clean\n');

    for (const [label, sql] of [
      ['column   ', COLUMNS],
      ['constraint', CONSTRAINTS],
      ['index    ', INDEXES],
    ] as const) {
      const live = await inventory(client, sql, 'public');
      const fresh = await inventory(client, sql, SCRATCH);
      differences.push(...compare(label, live, fresh));
    }
  } finally {
    // The point of the whole design. Nothing above is ever committed.
    await client.query('ROLLBACK');
  }

  // `schema_migration` is the bookkeeping table `migrate.ts` creates when it runs, not something a
  // migration declares, so a replay never produces it. Its absence from the fresh schema is the
  // tool working, not drift.
  const real = differences.filter((d) => !d.includes('schema_migration'));

  if (real.length === 0) {
    console.log('  No drift. The live schema is exactly what a fresh migration run produces.');
    console.log('  The checksum warning on 001 and 002 is therefore cosmetic: those files were');
    console.log('  edited after they were applied, but not in any way the database can tell.\n');
  } else {
    console.log(`  ${real.length} difference(s) between the live schema and a fresh run:\n`);
    for (const line of real) {
      console.log(line);
    }
    console.log('');
  }
  await client.end();
  process.exit(real.length === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(`schema-drift failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
