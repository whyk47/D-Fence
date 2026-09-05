/**
 * D-Fence — remove the acceptance harness's own footprints from the demonstration data.
 * Traces: 4.1.15, 4.1.16, 4.1.17, 8.3.12, 2.4.2.
 *
 * Segment D of `uat.ts` drives a real work order to Verified, because that is the requirement it
 * is testing (8.3.12), and a verification writes a real `treatment_record`. Until 2026-09-05 it did
 * that on whichever cluster ranked **first**, so after thirty-five runs the largest cluster in
 * Singapore carried thirty-five treatments dated today. `DaysSinceLastTreatment` read zero,
 * 4.1.15's driver contributed nothing, and 15% of the scoring weight was suppressed on the exact
 * row a demonstration opens with. Nothing was broken; the scoring was doing the right thing with
 * data the tests had written.
 *
 * The harness now writes to the smallest cluster instead. This tool clears up what the old
 * behaviour left behind.
 *
 * **It refuses to run without `--confirm`, and prints exactly what it would delete first.** These
 * are real rows in a shared database. It only ever matches work orders whose instructions carry
 * the harness's own `UAT` marker, and their treatment records — never anything a person created.
 *
 * **The audit trail is deliberately left alone.** 2.4.2 says an audit record may not be modified
 * or deleted by any role, and the database enforces it with a trigger; the rows recording that a
 * work order was verified stay, which is correct — the verification did happen, and this tool
 * removing its consequences does not make it untrue.
 */
import { ConfigLoader } from '../config/ConfigLoader';
import { Database } from '../persistence/Database';

const MARKER = 'UAT%';

async function main(): Promise<void> {
  const confirmed = process.argv.includes('--confirm');
  const url = ConfigLoader.load().get('DATABASE_URL');
  if (url === '') {
    console.log('DATABASE_URL is not set — nothing to clean.');
    return;
  }
  const db = new Database(url);

  const orders = await db.query(
    `SELECT w.id, w.status, c.locality, c.case_size
       FROM work_order w JOIN cluster c ON c.id = w.cluster_id
      WHERE w.instructions LIKE $1
      ORDER BY c.case_size DESC`,
    [MARKER],
  );
  const treatments = await db.query(
    `SELECT t.id, t.completion_date::text AS completion_date, c.locality
       FROM treatment_record t
       JOIN work_order w ON w.id = t.work_order_id
       JOIN cluster c ON c.id = t.cluster_id
      WHERE w.instructions LIKE $1`,
    [MARKER],
  );

  console.log(`work orders created by the harness: ${orders.length}`);
  for (const row of orders.slice(0, 10)) {
    const r = row as Record<string, unknown>;
    console.log(`  ${String(r.status).padEnd(10)} ${String(r.case_size).padStart(4)} cases  ${String(r.locality).slice(0, 45)}`);
  }
  console.log(`treatment records written by those verifications: ${treatments.length}`);

  if (!confirmed) {
    console.log('\ndry run — nothing was deleted. Re-run with --confirm to delete the rows above.');
    console.log('The audit trail is never touched: 2.4.2 forbids it and the database enforces it.');
    await db.close();
    return;
  }

  // Treatments first: `work_order` is what they are matched by, so deleting the orders first would
  // leave the treatments unidentifiable.
  const removedTreatments = await db.query(
    `DELETE FROM treatment_record t
      USING work_order w
      WHERE w.id = t.work_order_id AND w.instructions LIKE $1
      RETURNING t.id`,
    [MARKER],
  );
  const removedEvidence = await db.query(
    `DELETE FROM completion_evidence e
      USING work_order w
      WHERE w.id = e.work_order_id AND w.instructions LIKE $1
      RETURNING e.id`,
    [MARKER],
  );
  const removedOrders = await db.query(
    'DELETE FROM work_order WHERE instructions LIKE $1 RETURNING id',
    [MARKER],
  );
  console.log(
    `deleted ${removedTreatments.length} treatment record(s), ${removedEvidence.length} evidence row(s), `
      + `${removedOrders.length} work order(s).`,
  );
  console.log('Run the scoring cycle (or `npm run ingest`) for the priority table to reflect it.');
  await db.close();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
