/**
 * D-Fence — one live forecast cycle against the real endpoint.
 *
 *     npx tsx src/tools/forecast-live.ts
 *
 * Proves 1.3.1 to 1.3.5 end to end against data.gov.sg and the live NEA cluster feed rather than
 * against a fixture: fetch the forecast, fetch the clusters, join them, and print what every active
 * cluster ended up with. Kept as a tool rather than a test because it needs the network.
 */
import { HttpClient } from '../boundary/gateways/HttpClient';
import { ForecastGateway } from '../boundary/gateways/ForecastGateway';
import { NEAFeedGateway } from '../boundary/gateways/NEAFeedGateway';
import { ForecastIngestionJob } from '../control/ingestion/ForecastIngestionJob';
import { ClusterIngestionJob } from '../control/ingestion/ClusterIngestionJob';
import {
  InMemoryClusterStore,
  InMemoryForecastStore,
  InMemoryIngestionRunStore,
} from '../persistence/memory/InMemoryStores';
import { ConfigLoader } from '../config/ConfigLoader';

async function main(): Promise<void> {
  const config = ConfigLoader.load();
  const http = new HttpClient();
  const runs = new InMemoryIngestionRunStore();
  const clusters = new InMemoryClusterStore();
  const forecasts = new InMemoryForecastStore();

  const clusterRun = await new ClusterIngestionJob(
    new NEAFeedGateway(
      http,
      config.clusterSource.metadataBaseUrl,
      config.clusterSource.downloadBaseUrl,
      config.clusterSource.datasetId,
    ),
    runs,
    clusters,
  ).run('MANUAL');
  console.log(`clusters: ${clusterRun.outcome} (${clusterRun.featureCount})`);

  const job = new ForecastIngestionJob(new ForecastGateway(http), runs, forecasts, clusters);
  const run = await job.run('MANUAL');
  console.log(`forecast: ${run.outcome} (${run.featureCount} cluster(s) flagged)`);

  for (const forecast of await forecasts.latest()) {
    console.log(
      `  ${forecast.region.padEnd(8)} rain=${String(forecast.heavyRainExpected).padEnd(5)} ` +
        `${forecast.validFrom.toISOString()} → ${forecast.validTo.toISOString()}`,
    );
    console.log(`           ${forecast.forecastText}`);
  }
  for (const cluster of await clusters.findActive()) {
    console.log(
      `  ${cluster.locality.slice(0, 40).padEnd(42)} ${cluster.forecastRegion.padEnd(8)} ` +
        `rain=${cluster.heavyRainExpected}`,
    );
  }
  if (job.outsideEveryRegion.length > 0) {
    console.log(`  fallback used for: ${job.outsideEveryRegion.join(', ')}`);
  }
}

void main();
