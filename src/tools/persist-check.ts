/**
 * D-Fence — read back, from a second process, what the running server wrote.
 *
 *     npx tsx src/tools/persist-check.ts
 *
 * 10.2.3 is a claim about a restart, so the evidence has to come from a process that did not do the
 * writing. This one connects to the same database, counts the four aggregates that moved off memory
 * and prints the newest row of each — if the server were still answering from a Map, every count
 * here would be zero and the server would still look perfectly healthy.
 */
import { ConfigLoader } from '../config/ConfigLoader';
import { Database } from '../persistence/Database';

async function main(): Promise<void> {
  const url = ConfigLoader.load().get('DATABASE_URL');
  if (url === '') {
    console.log('DATABASE_URL is not set; there is nothing to read back.');
    return;
  }
  const db = new Database(url);
  try {
    const rows = await db.query(`
      SELECT 'account' AS what, count(*)::int AS n FROM account
      UNION ALL SELECT 'session', count(*)::int FROM session
      UNION ALL SELECT 'report', count(*)::int FROM report
      UNION ALL SELECT 'work_order', count(*)::int FROM work_order
      UNION ALL SELECT 'completion_evidence', count(*)::int FROM completion_evidence
      UNION ALL SELECT 'treatment_record', count(*)::int FROM treatment_record
      UNION ALL SELECT 'report_status_change', count(*)::int FROM report_status_change
      UNION ALL SELECT 'work_order_assignment', count(*)::int FROM work_order_assignment
      ORDER BY what`);
    for (const row of rows) {
      console.log(`  ${String(row.what).padEnd(22)} ${String(row.n).padStart(5)}`);
    }
    const latest = await db.query(
      `SELECT w.status, w.task_type, w.scheduled_date, t.completion_date
         FROM work_order w LEFT JOIN treatment_record t ON t.work_order_id = w.id
        ORDER BY w.created_at DESC LIMIT 1`,
    );
    console.log('\n  newest work order:', latest[0] ?? '(none)');
  } finally {
    await db.close();
  }
}

void main();
