/**
 * D-Fence — apply the SQL migrations.
 *
 *     npx tsx src/tools/migrate.ts            # apply anything not yet applied
 *     npx tsx src/tools/migrate.ts --status   # list what has been applied, change nothing
 *
 * Deliberately small. A migration framework would be a dependency and a vocabulary to learn for a
 * schema that is one file long; what is actually needed is that a migration runs **once**, in
 * order, and that the record of what ran lives in the same database as the schema it describes —
 * otherwise "has this been applied?" is answered by memory.
 *
 * Each file runs inside a transaction, so a migration that fails halfway leaves no half-schema
 * behind (10.2.4 applied to our own writes rather than to a feed's).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { ConfigLoader } from '../config/ConfigLoader';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(HERE, '..', 'persistence', 'migrations');
const CA_PATH = resolve(HERE, '..', 'certs', 'prod-ca-2021.crt');

async function main(): Promise<void> {
  const connectionString = ConfigLoader.load().get('DATABASE_URL');
  if (connectionString === '') {
    console.log('DATABASE_URL is not set. Run: npx tsx src/tools/supabase-check.ts');
    return;
  }

  const client = new Client({
    connectionString,
    ssl: { ca: readFileSync(CA_PATH, 'utf8'), rejectUnauthorized: true },
  });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        filename   text PRIMARY KEY,
        -- The checksum is the point: it catches an already-applied migration being edited, which
        -- is the failure that makes two developers' databases silently differ.
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const applied = new Map(
      (await client.query<{ filename: string; checksum: string }>('SELECT filename, checksum FROM schema_migration'))
        .rows.map((r) => [r.filename, r.checksum]),
    );
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

    if (process.argv.includes('--status')) {
      for (const file of files) {
        const state = applied.has(file) ? 'applied' : 'PENDING';
        console.log(`  ${state.padEnd(8)} ${file}`);
      }
      return;
    }

    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex').slice(0, 16);
      const previous = applied.get(file);

      if (previous === checksum) {
        console.log(`  = ${file} (already applied)`);
        continue;
      }
      if (previous !== undefined) {
        // Refused rather than re-run. Re-running an edited migration is how one database ends up
        // with a column another does not have, and nothing reports it.
        console.log(`  ! ${file} was applied with a different checksum — write a new migration instead`);
        process.exitCode = 1;
        continue;
      }

      console.log(`  + ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migration (filename, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    const tables = await client.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM information_schema.tables WHERE table_schema = 'public'",
    );
    console.log(`\npublic tables now: ${tables.rows[0]?.n ?? '0'}`);
  } finally {
    await client.end();
  }
}

void main();
