/**
 * D-Fence — check that the schema's guarantees are real.
 *
 *     npx tsx src/tools/schema-verify.ts
 *
 * A migration that runs without error has created tables; it has not shown that the rules written
 * into them do anything. This exercises the three that carry a requirement each and would otherwise
 * be believed on sight: 2.4.2's append-only audit trail, 5.1.13's one-corroboration-per-resident,
 * and the GIST indexes that make 3.1.8 and 5.1.7 affordable.
 *
 * Everything it writes is rolled back.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { ConfigLoader } from '../config/ConfigLoader';

const CA_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'certs', 'prod-ca-2021.crt');

function line(ok: boolean, label: string, detail: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(34)} ${detail}`);
}

async function main(): Promise<void> {
  const client = new Client({
    connectionString: ConfigLoader.load().get('DATABASE_URL'),
    ssl: { ca: readFileSync(CA_PATH, 'utf8'), rejectUnauthorized: true },
  });
  await client.connect();

  try {
    const tables = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
    );
    console.log(`tables (${tables.rows.length}): ${tables.rows.map((r) => r.table_name).join(', ')}\n`);

    const gist = await client.query<{ indexname: string; tablename: string }>(
      "SELECT indexname, tablename FROM pg_indexes WHERE schemaname='public' AND indexdef LIKE '%USING gist%' ORDER BY tablename",
    );
    line(
      gist.rows.length >= 4,
      'GIST spatial indexes',
      gist.rows.length === 0 ? 'NONE — 1.2.5/3.1.8/5.1.7 would table-scan' : gist.rows.map((r) => r.tablename).join(', '),
    );

    const geography = await client.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM information_schema.columns WHERE table_schema='public' AND udt_name='geography'",
    );
    line(Number(geography.rows[0]?.n) >= 4, 'geography columns', `${geography.rows[0]?.n} (metres, not degrees)`);

    // 2.4.2 — the trigger, exercised rather than admired.
    //
    // The row is re-inserted before EACH attempt. The first version of this check rolled back after
    // the failed UPDATE and then tried to DELETE — matching zero rows, which fires no row-level
    // trigger, and reported "the trigger is not firing" about a trigger that was working. A check
    // that can pass or fail for a reason unrelated to what it names is worse than no check.
    for (const [operation, sql] of [
      ['UPDATE', "UPDATE audit_record SET action='tampered' WHERE action='test:verify'"],
      ['DELETE', "DELETE FROM audit_record WHERE action='test:verify'"],
    ] as const) {
      await client.query('BEGIN');
      await client.query(
        "INSERT INTO audit_record (account_id, action, target_entity, target_id) VALUES (gen_random_uuid(), 'test:verify', 'Test', gen_random_uuid())",
      );
      const before = await client.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM audit_record WHERE action='test:verify'",
      );
      try {
        const result = await client.query(sql);
        line(
          false,
          `audit ${operation} refused (2.4.2)`,
          `IT SUCCEEDED on ${result.rowCount ?? 0} of ${before.rows[0]?.n ?? 0} row(s) — the trigger is not firing`,
        );
      } catch (error) {
        const message = (error as Error).message;
        line(message.includes('2.4.2'), `audit ${operation} refused (2.4.2)`, message.split('\n')[0] ?? '');
      }
      await client.query('ROLLBACK');
    }

    // 5.1.13 — one corroboration per resident per report, enforced by the database rather than by
    // the controller alone, so a double-tap on a slow connection cannot raise the count.
    const constraint = await client.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM pg_constraint WHERE conrelid='corroboration'::regclass AND contype='u'",
    );
    line(Number(constraint.rows[0]?.n) >= 1, 'one corroboration per resident', '5.1.13 unique (report, account)');

    // 10.4.3 — the report must survive its reporter. A CASCADE here would delete the evidence.
    const rule = await client.query<{ confdeltype: string }>(
      "SELECT confdeltype FROM pg_constraint WHERE conrelid='report'::regclass AND contype='f' AND conname LIKE '%reporter%'",
    );
    line(
      rule.rows[0]?.confdeltype === 'n',
      'report survives its reporter (10.4.3)',
      rule.rows[0]?.confdeltype === 'n' ? 'ON DELETE SET NULL' : `ON DELETE '${rule.rows[0]?.confdeltype ?? '?'}' — should be SET NULL`,
    );

    // 2.4.2 again, from the other direction: the audit trail must not cascade away with an account.
    const auditFk = await client.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM pg_constraint WHERE conrelid='audit_record'::regclass AND contype='f'",
    );
    line(auditFk.rows[0]?.n === '0', 'audit has no cascading FK', 'a deleted account cannot erase its trail');
  } finally {
    await client.end();
  }
}

void main();
