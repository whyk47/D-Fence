/**
 * D-Fence — retire the accounts the test harnesses left behind.
 * Traces: 2.2.5, 2.4.2, 10.4.3.
 *
 *     npx tsx src/tools/purge-test-accounts.ts             # say what would happen, change nothing
 *     npx tsx src/tools/purge-test-accounts.ts --confirm   # do it
 *
 * The Staff Accounts screen carries 130 rows, of which about 110 were created by `uat.ts`,
 * `client-uat.ts` and `demo-drive.ts` on their way past. Every harness mints a fresh address per
 * run (`resident+<timestamp>@uat.d-fence.local`), so none of them is ever reused and the pile only
 * grows.
 *
 * **Deleting them all is not the tidy-up it looks like, and this tool will not do it.** The
 * foreign keys are `ON DELETE SET NULL`, not `CASCADE`, so removing an account does not remove
 * what it did — it removes the *attribution*:
 *
 *   - `report.reporter_id`       — 75 of the 91 reports in the database were filed by a harness
 *                                  resident. Deleting those accounts leaves 75 reports with no
 *                                  reporter, which is a state 5.3.5 has no answer for: "the
 *                                  reporter always sees their own" cannot match a null.
 *   - `work_order.assignee_id`   — 51 of the 67 work orders are assigned to a harness crew member.
 *                                  Deleting them empties the "open work orders per crew member"
 *                                  figure on 7.3.x's dashboard, which is one of the numbers the
 *                                  screen exists to show.
 *   - `report.moderator_id`      — 16 reports name `manager@d-fence.local` as the moderator.
 *
 * So the rule is: **delete an account only when nothing in the database points at it, and
 * deactivate the rest.** 2.2.5 already provides deactivation, the Staff screen already renders it
 * as a Deactivated pill, and a deactivated account cannot sign in — which is the whole of the
 * security argument for removing them. What it does not do is rewrite history that actually
 * happened, which is the same principle 2.4.2 applies to the audit trail.
 *
 * `local_credential` is not foreign-keyed to `account` — it is keyed by the provider's id and
 * carries its own `UNIQUE (email)` — so a deleted account with a surviving credential row would
 * make its address permanently unusable. Both are handled together here.
 *
 * Nothing in this file touches `audit_record`: 2.4.2 forbids it, and a trigger enforces it.
 */
import { ConfigLoader } from '../config/ConfigLoader';
import { Database } from '../persistence/Database';

/**
 * Addresses this tool may act on. Everything else is out of scope by construction, so a real
 * resident can never be matched by a pattern that was meant for a harness.
 */
const TEST_PATTERNS = [
  '%@uat.d-fence.local', // uat.ts
  '%@dfence.test', // client-uat.ts
  '%@d-fence.test', // the restart probe
  'crew-demo-%@d-fence.local', // demo-drive.ts
  'shots-crew@d-fence.local', // screen-shots.ts
];

/**
 * Never matched, whatever the patterns say.
 *
 * `manager@` and `resident@` are the seeded demonstration accounts named in `src/.env`; the
 * deployment recreates them at startup, but it does not recreate the 15 reports and 16 moderation
 * decisions attached to them. The tombstone is the record that an erasure happened (10.4.3) and
 * deleting it would erase the erasure.
 */
const PROTECTED = ['manager@d-fence.local', 'resident@d-fence.local', 'ychow015@e.ntu.edu.sg'];
const TOMBSTONE = 'deleted-%@invalid';

interface Candidate {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  owned: number;
}

async function candidates(db: Database): Promise<Candidate[]> {
  const patterns = TEST_PATTERNS.map((_, index) => `a.email LIKE $${index + 1}`).join(' OR ');
  const rows = await db.query(
    `SELECT a.id, a.email, a.role, a.is_active,
            (SELECT count(*) FROM report r WHERE r.reporter_id = a.id)
          + (SELECT count(*) FROM report r WHERE r.moderator_id = a.id)
          + (SELECT count(*) FROM work_order w WHERE w.assignee_id = a.id)
          + (SELECT count(*) FROM work_order_assignment x WHERE x.assignee_id = a.id)
          + (SELECT count(*) FROM corroboration c WHERE c.account_id = a.id)
          + (SELECT count(*) FROM saved_location s WHERE s.account_id = a.id) AS owned
       FROM account a
      WHERE (${patterns})
        AND a.email NOT LIKE '${TOMBSTONE}'
      ORDER BY a.email`,
    TEST_PATTERNS,
  );
  return (rows as Record<string, unknown>[])
    .map((row) => ({
      id: String(row.id),
      email: String(row.email),
      role: String(row.role),
      isActive: row.is_active === true,
      owned: Number(row.owned),
    }))
    .filter((row) => !PROTECTED.includes(row.email));
}

async function main(): Promise<void> {
  const confirmed = process.argv.includes('--confirm');
  const url = ConfigLoader.load().get('DATABASE_URL');
  if (url === '') {
    console.log('DATABASE_URL is not set — there is no account table to read.');
    return;
  }
  const db = new Database(url);

  const all = await candidates(db);
  const deletable = all.filter((row) => row.owned === 0);
  const keep = all.filter((row) => row.owned > 0 && row.isActive);

  const total = (await db.query('SELECT count(*) AS n FROM account')) as Record<string, unknown>[];
  console.log(`${String(total[0]?.n ?? '?')} accounts in the database, ${all.length} of them created by a harness.\n`);

  console.log(`delete — nothing in the database points at these: ${deletable.length}`);
  for (const row of deletable.slice(0, 8)) {
    console.log(`    ${row.role.padEnd(18)} ${row.email}`);
  }
  if (deletable.length > 8) {
    console.log(`    ... and ${deletable.length - 8} more of the same shape`);
  }

  console.log(`\ndeactivate — these are named by reports or work orders: ${keep.length}`);
  for (const row of keep.slice(0, 8)) {
    console.log(`    ${row.role.padEnd(18)} ${row.email.padEnd(38)} ${row.owned} reference(s)`);
  }
  if (keep.length > 8) {
    console.log(`    ... and ${keep.length - 8} more`);
  }

  console.log(`\nleft alone: ${PROTECTED.join(', ')}, and every erasure tombstone.`);

  if (!confirmed) {
    console.log('\ndry run — nothing was changed. Re-run with --confirm.');
    await db.close();
    return;
  }

  // One transaction: a half-applied retirement would leave accounts deleted and their credentials
  // behind, and the credential's UNIQUE (email) would then refuse the address forever.
  let deleted = 0;
  let deactivated = 0;
  await db.transaction(async (tx) => {
    for (const row of deletable) {
      await tx.query('DELETE FROM local_credential WHERE email = $1', [row.email]);
      await tx.query('DELETE FROM account WHERE id = $1', [row.id]);
      deleted += 1;
    }
    for (const row of keep) {
      await tx.query('UPDATE account SET is_active = false WHERE id = $1', [row.id]);
      await tx.query('UPDATE local_credential SET disabled = true WHERE email = $1', [row.email]);
      deactivated += 1;
    }
  });

  console.log(`\ndeleted ${deleted} account(s) and their credentials.`);
  console.log(`deactivated ${deactivated} account(s); their reports and work orders keep their attribution.`);
  await db.close();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
