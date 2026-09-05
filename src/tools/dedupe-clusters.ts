/**
 * D-Fence — a one-off collapse of the cluster rows NEA's reissued OBJECTIDs created.
 *
 * `ClusterIngestionJob` now keys identity on the locality, so this cannot happen again. It does not
 * repair what is already stored: the feed short-circuits on an unchanged publisher stamp, so the
 * duplicates would sit in the table — and in the dashboard's case count, and three times over in
 * the priority table — until NEA published twice more, which can be a day or more away.
 *
 * Keeps the OLDEST active row for each locality and deactivates the rest, which is the same row
 * `ClusterIngestionJob` now carries identity to, so the next real publish updates the survivor
 * rather than reviving a duplicate.
 *
 * **Deactivates, never deletes.** Work orders, reports, treatment records and priority history all
 * reference cluster ids; deleting a row would either fail on the foreign key or orphan real
 * operational work. `is_active = false` is what 1.1.10 means by CLOSED, and it is reversible.
 *
 *     npx tsx src/tools/dedupe-clusters.ts            # report only, changes nothing
 *     npx tsx src/tools/dedupe-clusters.ts --apply    # make the change
 */
import { ConfigLoader } from '../config/ConfigLoader';
import { Database } from '../persistence/Database';
import { ClusterRepository } from '../persistence/ClusterRepository';

const apply = process.argv.includes('--apply');

async function main(): Promise<void> {
  const config = ConfigLoader.load();
  const url = process.env.DATABASE_URL ?? config.get('DATABASE_URL');
  if (url === '') {
    throw new Error('no DATABASE_URL, in the environment or in src/.env');
  }
  const db = new Database(url);
  const clusters = new ClusterRepository(db);

  const active = [...(await clusters.findActive())].sort(
    (a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime(),
  );
  const keep = new Map<string, string>(); // locality -> object id of the survivor
  const drop: Array<{ locality: string; objectId: string }> = [];
  for (const cluster of active) {
    if (keep.has(cluster.locality)) {
      drop.push({ locality: cluster.locality, objectId: cluster.objectId });
    } else {
      keep.set(cluster.locality, cluster.objectId);
    }
  }

  console.log(`active clusters: ${active.length}`);
  console.log(`distinct localities: ${keep.size}`);
  console.log(`duplicates to close: ${drop.length}`);
  for (const d of drop) {
    console.log(`  close ${d.objectId}  ${d.locality.slice(0, 64)}`);
  }

  if (drop.length === 0) {
    console.log('nothing to do');
    await db.close();
    return;
  }
  if (!apply) {
    console.log('\nreport only — pass --apply to make the change');
    await db.close();
    return;
  }

  // The store closes everything active that is NOT in the set it is given, so it is handed the
  // survivors rather than the condemned.
  const closed = await clusters.deactivateAbsent(new Set(keep.values()));
  console.log(`\nclosed ${closed.length} duplicate cluster row(s)`);
  const after = await clusters.findActive();
  console.log(`active clusters now: ${after.length}`);
  const localities = new Set(after.map((c) => c.locality));
  console.log(`distinct localities now: ${localities.size}`);
  if (after.length !== localities.size) {
    console.log('WARNING: still more rows than localities — inspect before trusting the dashboard');
  }
  await db.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
