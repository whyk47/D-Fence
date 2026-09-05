/**
 * D-Fence — a one-line look at what the deployment has actually persisted.
 * Traces: 2.4.1, 3.1.1, 10.2.3.
 *
 * Written after two silent production defects with the same shape: photographs and the audit trail
 * both had correct code, passing tests and an empty table, because the composition root chose the
 * in-memory store and nothing ever looked. `npm run peek` counts rows in the tables that are
 * supposed to be filling and prints the newest few audit entries, which is the cheapest possible
 * check that the deployment is writing where it claims to.
 *
 * Read-only by construction: the only statements here are SELECTs.
 */
import { ConfigLoader } from '../config/ConfigLoader';
import { Database } from '../persistence/Database';

const TABLES = [
  'audit_record',
  'saved_location',
  'alert_subscription',
  'report',
  'report_photo',
  'work_order',
  'completion_evidence',
  'treatment_record',
  'account',
  'local_credential',
  'local_credential_token',
  'cluster',
  'priority_score',
];

async function main(): Promise<void> {
  const url = ConfigLoader.load().get('DATABASE_URL');
  if (url === '') {
    console.log('DATABASE_URL is not set — there is nothing to look at.');
    return;
  }
  const db = new Database(url);
  console.log('rows now stored:');
  for (const table of TABLES) {
    const rows = await db.query(`SELECT count(*)::int AS n FROM ${table}`);
    const n = Number((rows[0] as { n: number }).n);
    // A zero here is the signal the two defects would have shown on any day of the weeks they
    // were live, which is the whole reason this file exists.
    console.log(`  ${table.padEnd(20)} ${String(n).padStart(6)}${n === 0 ? '   <- empty' : ''}`);
  }

  const recent = await db.query(
    `SELECT account_id, action, target_entity, occurred_at
       FROM audit_record ORDER BY occurred_at DESC, id DESC LIMIT 8`,
  );
  console.log('\nnewest audit entries (2.4.1):');
  for (const row of recent) {
    const r = row as Record<string, unknown>;
    console.log(
      `  ${new Date(String(r.occurred_at)).toISOString()}  ${String(r.action).padEnd(24)}`
        + `${String(r.target_entity).padEnd(16)}${String(r.account_id).slice(0, 8)}`,
    );
  }
  await db.close();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
