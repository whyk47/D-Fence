/**
 * D-Fence — one live ingestion and scoring cycle, printed to the terminal.
 *
 *     npm run ingest          # pull, score, print
 *     npm run ingest -- --geocode "Ho Ching Road"   # also exercise OneMap
 *
 * This is the smallest honest end-to-end proof: real NEA data in, a ranked priority table out,
 * through the same control classes the server will use. It runs against the in-memory stores, so it
 * needs no database — which is the point, because Supabase does not exist yet and cluster history
 * has to start accumulating now for the trend view to have anything to show in week 11.
 *
 * It is also the fastest way to see the 1.1.20 conditional download work: run it twice.
 */
import { ConfigLoader } from '../config/ConfigLoader';
import { HttpClient } from '../boundary/gateways/HttpClient';
import { NEAFeedGateway } from '../boundary/gateways/NEAFeedGateway';
import { OneMapGateway } from '../boundary/gateways/OneMapGateway';
import {
  InMemoryClusterStore,
  InMemoryIngestionRunStore,
  InMemoryPriorityScoreStore,
} from '../persistence/memory/InMemoryStores';
import { ClusterIngestionJob } from '../control/ingestion/ClusterIngestionJob';
import { NormalisationFactory } from '../control/normalisation/NormalisationFactory';
import { PriorityScoringEngine, DriverInputs } from '../control/PriorityScoringEngine';
import { Driver } from '../entity/enums';

async function main(): Promise<void> {
  const config = ConfigLoader.load();
  const http = new HttpClient();
  const feed = new NEAFeedGateway(
    http,
    config.clusterSource.metadataBaseUrl,
    config.clusterSource.downloadBaseUrl,
    config.clusterSource.datasetId,
  );

  const clusters = new InMemoryClusterStore();
  const runs = new InMemoryIngestionRunStore();
  const scores = new InMemoryPriorityScoreStore();

  const job = new ClusterIngestionJob(feed, runs, clusters);
  console.log('Ingesting NEA dengue clusters…');
  const run = await job.run('MANUAL');
  console.log(`  outcome ${run.outcome}, ${run.featureCount} features, ${job.rejected.length} rejected`);
  if (job.rejected.length > 0) {
    for (const r of job.rejected) {
      console.log(`  rejected ${r.objectId ?? '(no id)'}: missing ${r.missingField}`);
    }
  }

  const active = await clusters.findActive();
  if (active.length === 0) {
    console.log('No active clusters stored — nothing to score.');
    return;
  }

  const engine = new PriorityScoringEngine(
    NormalisationFactory.build(config.normalisation),
    config,
    scores,
  );
  // Rainfall and reports are not ingested yet, so those drivers are legitimately absent and every
  // score below is DEGRADED. That is the honest state of the system, not a bug — and it is exactly
  // what 4.1.13 and 4.1.20 exist to make visible rather than hide behind a plausible number.
  engine.markStale([Driver.Rainfall24h, Driver.Rainfall72h, Driver.VerifiedOpenReportCount]);
  const inputs = new Map<string, DriverInputs>(
    // 4.1.16: no treatment record yet means the 90-day default, which saturates that driver.
    active.map((c) => [c.id, { daysSinceLastTreatment: 90 } as DriverInputs]),
  );

  const ranking = await engine.computeScores(active, inputs);
  const top = ranking.top(active.length);

  console.log('\n  #  score  tier    cases  Δ    locality');
  console.log('  -  -----  ------  -----  ---  --------------------------------------------');
  for (const score of top) {
    const cluster = active.find((c) => c.id === score.clusterId);
    if (cluster === undefined) {
      continue;
    }
    console.log(
      `  ${String(score.rank).padStart(2)} ${score.score.toFixed(1).padStart(6)}  ` +
        `${score.tier.padEnd(6)}  ${String(cluster.caseSize).padStart(5)}  ` +
        `${String(cluster.caseDelta).padStart(3)}  ${cluster.locality.slice(0, 44)}`,
    );
  }

  const leader = top[0];
  if (leader !== undefined) {
    console.log(`\n  Top cluster: ${leader.explain()}`);
  }

  const geocodeFlag = process.argv.indexOf('--geocode');
  if (geocodeFlag !== -1 && process.argv[geocodeFlag + 1] !== undefined) {
    const address = process.argv[geocodeFlag + 1] as string;
    const onemap = new OneMapGateway(
      http,
      'https://www.onemap.gov.sg',
      config.get('ONE_MAP_TOKEN') || null,
      config.get('ONE_MAP_EMAIL')
        ? { email: config.get('ONE_MAP_EMAIL'), password: config.get('ONE_MAP_PASSWORD') }
        : null,
    );
    const points = await onemap.search(address);
    console.log(`\n  OneMap "${address}": ${points.length} match(es)`);
    for (const p of points.slice(0, 3)) {
      console.log(`    ${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`);
    }
  }
}

void main().catch((error: unknown) => {
  console.error('ingest failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
