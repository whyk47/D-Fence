/**
 * D-Fence — application server entry point.
 *
 *     npm run dev:server        # http://localhost:3000/ops
 *
 * Boots configuration, wires the object graph, ingests once so the dashboard has data on the first
 * request, schedules the two cycles from `ingestionIntervals`, and serves.
 *
 * It runs on the **in-memory stores**: Supabase does not exist yet, and a dashboard that only works
 * after a database is provisioned cannot be shown to the team this week. Swapping to Postgres is a
 * change to the four lines that construct the stores — which is the ports layer earning its keep.
 * The cost is honest and stated: restarting the process loses the history.
 */
import { ConfigLoader } from './config/ConfigLoader';
import { HttpClient } from './boundary/gateways/HttpClient';
import { NEAFeedGateway } from './boundary/gateways/NEAFeedGateway';
import { RainfallGateway } from './boundary/gateways/RainfallGateway';
import { ExpressApp } from './boundary/http/ExpressApp';
import { DashboardRoutes } from './boundary/http/DashboardRoutes';
import {
  InMemoryAuditStore,
  InMemoryClusterStore,
  InMemoryIngestionRunStore,
  InMemoryPriorityScoreStore,
  InMemoryRainfallStore,
} from './persistence/memory/InMemoryStores';
import { InMemoryTreatmentRecordStore, InMemoryWorkOrderStore, RecordingNotifier } from './persistence/memory/InMemoryWorkOrderStores';
import { WorkOrderTransitionTable } from './control/WorkOrderTransitionTable';
import { WorkOrderLifecycleController } from './control/WorkOrderLifecycleController';
import { DispatchController } from './control/DispatchController';
import { AccessControlService } from './control/AccessControlService';
import { AccessPolicy } from './control/AccessPolicy';
import { DashboardController, principalFor } from './control/DashboardController';
import { ClusterIngestionJob } from './control/ingestion/ClusterIngestionJob';
import { RainfallIngestionJob } from './control/ingestion/RainfallIngestionJob';
import { RainfallAccumulator } from './control/RainfallAccumulator';
import { NormalisationFactory } from './control/normalisation/NormalisationFactory';
import { PriorityScoringEngine, DriverInputs } from './control/PriorityScoringEngine';
import { Driver, Role, SourceKind } from './entity/enums';
import { renderOpsDashboard } from './boundary/http/OpsDashboardPage';

async function main(): Promise<void> {
  const config = ConfigLoader.load();
  const http = new HttpClient();

  const clusters = new InMemoryClusterStore();
  const rainfall = new InMemoryRainfallStore();
  const runs = new InMemoryIngestionRunStore();
  const scores = new InMemoryPriorityScoreStore();
  const audit = new InMemoryAuditStore();
  const workOrders = new InMemoryWorkOrderStore();
  const treatments = new InMemoryTreatmentRecordStore();
  const notifier = new RecordingNotifier();

  const clusterJob = new ClusterIngestionJob(
    new NEAFeedGateway(
      http,
      config.clusterSource.metadataBaseUrl,
      config.clusterSource.downloadBaseUrl,
      config.clusterSource.datasetId,
    ),
    runs,
    clusters,
  );
  const rainJob = new RainfallIngestionJob(new RainfallGateway(http), runs, rainfall);

  const engine = new PriorityScoringEngine(NormalisationFactory.build(config.normalisation), config, scores);
  const accumulator = new RainfallAccumulator();

  /** One full cycle: ingest both sources, then score. Scheduled, and run once at boot. */
  async function cycle(trigger: 'SCHEDULED' | 'MANUAL' = 'SCHEDULED'): Promise<void> {
    const clusterRun = await clusterJob.run(trigger);
    const rainRun = await rainJob.run(trigger);
    const active = await clusters.findActive();
    if (active.length === 0) {
      return;
    }

    const stale: Driver[] = [Driver.VerifiedOpenReportCount];
    if (rainRun.outcome === 'FAILED') {
      stale.push(Driver.Rainfall24h, Driver.Rainfall72h);
    }
    engine.markStale(stale);

    const now = new Date();
    const stations = await rainfall.stations();
    const readings = await rainfall.readingsSince(new Date(now.getTime() - 72 * 3_600_000));
    const inputs = new Map<string, DriverInputs>();
    for (const cluster of active) {
      const rain =
        stations.length === 0 || readings.length === 0
          ? null
          : accumulator.accumulate(cluster.boundary.centroid(), stations, readings, now);
      inputs.set(cluster.id, {
        rainfall24h: rain?.accum24hMm,
        rainfall72h: rain?.accum72hMm,
        // 4.1.15/4.1.16 — measured from the last verified treatment now that work orders exist,
        // defaulting to 90 days when a cluster has never been treated.
        daysSinceLastTreatment: await treatments.daysSinceLastTreatment(cluster.id, now),
      });
    }
    await engine.computeScores(active, inputs, now);
    console.log(
      `cycle: clusters ${clusterRun.outcome} (${clusterRun.featureCount}), ` +
        `rainfall ${rainRun.outcome} (${rainRun.featureCount}), scored ${active.length}`,
    );
  }

  console.log('Priming the first cycle…');
  await cycle('MANUAL');

  // 1.1.1 and 1.2.1 intervals come from configuration, not from constants here (10.6.2).
  const clusterInterval = (config.ingestionIntervals.get(SourceKind.Clusters) ?? 3600) * 1000;
  const rainInterval = (config.ingestionIntervals.get(SourceKind.Rainfall) ?? 300) * 1000;
  setInterval(() => void cycle().catch((e: unknown) => console.error('cycle failed:', e)), Math.min(clusterInterval, rainInterval));

  const ac = new AccessControlService(new AccessPolicy(), audit);
  const dashboard = new DashboardController(ac, clusters, scores, runs, workOrders);
  const lifecycle = new WorkOrderLifecycleController(
    new WorkOrderTransitionTable(),
    workOrders,
    treatments,
    notifier,
    // 8.5.3 — a verified work order is reflected in the next cycle; here, immediately.
    { rescoreCluster: async () => cycle('MANUAL') },
  );
  const dispatch = new DispatchController(ac, lifecycle, workOrders, clusters, scores, notifier);
  void dispatch;

  const app = new ExpressApp();
  app.mount(new DashboardRoutes(ac, dashboard));
  app.page('/ops', async () => {
    const manager = principalFor(Role.OperationsManager);
    return renderOpsDashboard(
      await dashboard.buildOverview(manager),
      await dashboard.buildPriorityTable(manager),
      await dashboard.buildAttentionPanel(manager),
    );
  });
  app.page('/', async () => Promise.resolve('<meta http-equiv="refresh" content="0; url=/ops">'));

  app.listen(Number(process.env.PORT ?? 3000));
}

void main().catch((error: unknown) => {
  console.error('server failed to start:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
