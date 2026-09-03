/**
 * D-Fence — one live ingestion and scoring cycle, printed to the terminal.
 *
 *     npm run ingest                                  # clusters + rainfall, score, print
 *     npm run ingest -- --no-rain                     # clusters only (fast; rainfall degraded)
 *     npm run ingest -- --backfill 3                  # walk N days of rainfall history first
 *     npm run ingest -- --geocode "Ho Ching Road"     # also exercise OneMap
 *
 * The smallest honest end-to-end proof: real NEA and Meteorological Service data in, a ranked
 * priority table out, through the same control classes the server will use. It runs against the
 * in-memory stores, so it needs no database — which is the point, because Supabase does not exist
 * yet and cluster history has to start accumulating now for the trend view to have anything to show
 * in week 11.
 */
import { ConfigLoader } from '../config/ConfigLoader';
import { HttpClient } from '../boundary/gateways/HttpClient';
import { NEAFeedGateway } from '../boundary/gateways/NEAFeedGateway';
import { RainfallGateway } from '../boundary/gateways/RainfallGateway';
import { OneMapGateway } from '../boundary/gateways/OneMapGateway';
import {
  InMemoryClusterStore,
  InMemoryIngestionRunStore,
  InMemoryPriorityScoreStore,
  InMemoryRainfallStore,
} from '../persistence/memory/InMemoryStores';
import { ClusterIngestionJob } from '../control/ingestion/ClusterIngestionJob';
import { RainfallIngestionJob } from '../control/ingestion/RainfallIngestionJob';
import { RainfallAccumulator } from '../control/RainfallAccumulator';
import { NormalisationFactory } from '../control/normalisation/NormalisationFactory';
import { PriorityScoringEngine, DriverInputs } from '../control/PriorityScoringEngine';
import { Driver } from '../entity/enums';

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const config = ConfigLoader.load();
  const http = new HttpClient();
  const now = new Date();

  const clusters = new InMemoryClusterStore();
  const rainfallStore = new InMemoryRainfallStore();
  const runs = new InMemoryIngestionRunStore();
  const scores = new InMemoryPriorityScoreStore();

  // --- clusters (1.1.x) ---------------------------------------------------------------------
  const feed = new NEAFeedGateway(
    http,
    config.clusterSource.metadataBaseUrl,
    config.clusterSource.downloadBaseUrl,
    config.clusterSource.datasetId,
  );
  const clusterJob = new ClusterIngestionJob(feed, runs, clusters);
  console.log('Ingesting NEA dengue clusters…');
  const clusterRun = await clusterJob.run('MANUAL');
  console.log(
    `  outcome ${clusterRun.outcome}, ${clusterRun.featureCount} features, ${clusterJob.rejected.length} rejected`,
  );
  for (const r of clusterJob.rejected) {
    console.log(`  rejected ${r.objectId ?? '(no id)'}: missing ${r.missingField}`);
  }

  const active = await clusters.findActive();
  if (active.length === 0) {
    console.log('No active clusters stored — nothing to score.');
    return;
  }

  // --- rainfall (1.2.x) ---------------------------------------------------------------------
  const staleDrivers: Driver[] = [Driver.VerifiedOpenReportCount];
  const rainGateway = new RainfallGateway(http);
  const rainJob = new RainfallIngestionJob(rainGateway, runs, rainfallStore);

  if (flag('no-rain')) {
    staleDrivers.push(Driver.Rainfall24h, Driver.Rainfall72h);
  } else {
    const days = Number(option('backfill') ?? 0);
    if (days > 0) {
      // A deliberately slower client: data.gov.sg answers a rapid backfill with 429 (observed
      // 2026-09-03). One second between pages, and HttpClient retries the 429s that still land.
      console.log(`\nBackfilling ${days} day(s) of rainfall history…`);
      const patient = new RainfallGateway(new HttpClient(1_000, 2_000));
      const written = await rainJob.backfill(await patient.fetchWindow(days));
      console.log(`  ${written} readings stored`);
    }
    console.log('\nIngesting rainfall…');
    const rainRun = await rainJob.run('MANUAL');
    console.log(
      `  outcome ${rainRun.outcome}, ${rainRun.featureCount} readings, ${rainJob.discarded} discarded as stale (1.2.4)`,
    );
    if (rainRun.outcome === 'FAILED') {
      staleDrivers.push(Driver.Rainfall24h, Driver.Rainfall72h);
    }
  }

  // 1.2.5, 1.2.6, 1.2.7, 1.2.8 — three nearest stations, inverse-distance weighted, rolling totals.
  const accumulator = new RainfallAccumulator();
  const stations = await rainfallStore.stations();
  const readings = await rainfallStore.readingsSince(new Date(now.getTime() - 72 * 3_600_000));
  const inputs = new Map<string, DriverInputs>();
  for (const cluster of active) {
    const rain =
      stations.length === 0 || readings.length === 0
        ? null
        : accumulator.accumulate(cluster.boundary.centroid(), stations, readings, now);
    inputs.set(cluster.id, {
      rainfall24h: rain?.accum24hMm,
      rainfall72h: rain?.accum72hMm,
      // 4.1.16: no treatment record yet means the 90-day default, which saturates that driver.
      daysSinceLastTreatment: 90,
    });
  }
  if (stations.length > 0) {
    console.log(`  ${stations.length} stations, ${readings.length} readings in the 72-hour window`);
  }

  // --- scoring (4.1.x) ----------------------------------------------------------------------
  const engine = new PriorityScoringEngine(NormalisationFactory.build(config.normalisation), config, scores);
  // Reports are not ingested yet, so that driver is legitimately absent. Every score below is
  // therefore DEGRADED — the honest state of the system, made visible by 4.1.13 and 4.1.20 rather
  // than hidden behind a plausible number.
  engine.markStale(staleDrivers);

  const ranking = await engine.computeScores(active, inputs, now);
  const top = ranking.top(active.length);

  console.log('\n  #  score  tier    cases  Δ    24h mm  72h mm  locality');
  console.log('  -  -----  ------  -----  ---  ------  ------  -------------------------------------');
  for (const score of top) {
    const cluster = active.find((c) => c.id === score.clusterId);
    if (cluster === undefined) {
      continue;
    }
    const rain = inputs.get(cluster.id);
    console.log(
      `  ${String(score.rank).padStart(2)} ${score.score.toFixed(1).padStart(6)}  ` +
        `${score.tier.padEnd(6)}  ${String(cluster.caseSize).padStart(5)}  ` +
        `${String(cluster.caseDelta).padStart(3)}  ` +
        `${(rain?.rainfall24h?.toFixed(1) ?? '   —').padStart(6)}  ` +
        `${(rain?.rainfall72h?.toFixed(1) ?? '   —').padStart(6)}  ` +
        `${cluster.locality.slice(0, 37)}`,
    );
  }

  const leader = top[0];
  if (leader !== undefined) {
    console.log(`\n  Top cluster: ${leader.explain()}`);
  }

  const address = option('geocode');
  if (address !== undefined) {
    const onemap = new OneMapGateway(
      http,
      'https://www.onemap.gov.sg',
      config.get('ONE_MAP_TOKEN') || null,
      config.get('ONE_MAP_EMAIL')
        ? { email: config.get('ONE_MAP_EMAIL'), password: config.get('ONE_MAP_PASSWORD') }
        : null,
    );
    const matches = await onemap.search(address);
    console.log(`\n  OneMap "${address}": ${matches.length} match(es)`);
    for (const m of matches.slice(0, 3)) {
      console.log(`    ${m.point.latitude.toFixed(6)}, ${m.point.longitude.toFixed(6)}  ${m.address}`);
    }
  }
}

void main().catch((error: unknown) => {
  console.error('ingest failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
