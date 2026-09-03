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
import { ReportRoutes } from './boundary/http/ReportRoutes';
import { ModerationRoutes } from './boundary/http/ModerationRoutes';
import { AuthRoutes } from './boundary/http/AuthRoutes';
import { AdminRoutes } from './boundary/http/AdminRoutes';
import { LocationRoutes } from './boundary/http/LocationRoutes';
import { AlertRoutes } from './boundary/http/AlertRoutes';
import { MapRoutes } from './boundary/http/MapRoutes';
import {
  InMemoryAuditStore,
  InMemoryClusterStore,
  InMemoryIngestionRunStore,
  InMemoryPriorityScoreStore,
  InMemoryRainfallStore,
} from './persistence/memory/InMemoryStores';
import { InMemoryTreatmentRecordStore, InMemoryWorkOrderStore, RecordingNotifier } from './persistence/memory/InMemoryWorkOrderStores';
import { InMemoryClusterLocator, InMemoryReportStore } from './persistence/memory/InMemoryReportStores';
import { ReportTransitionTable } from './control/ReportTransitionTable';
import { ReportLifecycleController } from './control/ReportLifecycleController';
import { ReportController } from './control/ReportController';
import { ModerationController } from './control/ModerationController';
import { AuthenticationController } from './control/AuthenticationController';
import { StaffAccountController } from './control/StaffAccountController';
import { GeocodingController } from './control/GeocodingController';
import { SavedLocationController } from './control/SavedLocationController';
import { OneMapGateway } from './boundary/gateways/OneMapGateway';
import { InMemorySavedLocationStore } from './persistence/memory/InMemoryLocationStores';
import {
  InMemoryAlertStore,
  InMemoryAlertSubscriptionStore,
  RecordingChannel,
} from './persistence/memory/InMemoryAlertStores';
import { TelegramGateway } from './boundary/gateways/TelegramGateway';
import { AlertTriggerEvaluator } from './control/AlertTriggerEvaluator';
import { AlertPreferenceController } from './control/AlertPreferenceController';
import { NotificationController } from './control/NotificationController';
import { TrendAnalyser } from './control/TrendAnalyser';
import { MapViewController } from './control/MapViewController';
import {
  InMemoryAccountStore,
  InMemorySessionStore,
  LocalAuthProvider,
} from './persistence/memory/InMemoryAccountStores';
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
import { ChangeClass, Driver, Role, SourceKind } from './entity/enums';
import { renderOpsDashboard } from './boundary/http/OpsDashboardPage';

async function main(): Promise<void> {
  const config = ConfigLoader.load();
  const http = new HttpClient();

  const auditStore = new InMemoryAuditStore();
  const ac0 = new AccessControlService(new AccessPolicy(), auditStore);
  const accounts = new InMemoryAccountStore();
  const sessions = new InMemorySessionStore();
  // Supabase Auth is the decision; the project does not exist yet, so §2 runs on the local
  // provider (real salted scrypt hashes, no email). Swapping is one line — see AuthProvider.
  const authProvider = new LocalAuthProvider();
  const authentication = new AuthenticationController(authProvider, accounts, sessions, auditStore);
  const staff = new StaffAccountController(ac0, authProvider, accounts, sessions, auditStore);

  const savedLocations = new InMemorySavedLocationStore();
  const subscriptions = new InMemoryAlertSubscriptionStore();
  const oneMap = new OneMapGateway(
    http,
    'https://www.onemap.gov.sg',
    config.get('ONE_MAP_TOKEN') || null,
    config.get('ONE_MAP_EMAIL')
      ? { email: config.get('ONE_MAP_EMAIL'), password: config.get('ONE_MAP_PASSWORD') }
      : null,
  );
  const geocoding = new GeocodingController(oneMap);
  const alertPreferences = new AlertPreferenceController(ac0, subscriptions, savedLocations);

  const alertStore = new InMemoryAlertStore();
  // 6.1.6 needs a bot token. Without one the recording channel keeps §6 runnable and testable —
  // and, unlike a silent no-op, it keeps a record of what *would* have been sent, so the alert
  // path can be demonstrated before the token arrives.
  const telegramToken = config.get('TELEGRAM_BOT_TOKEN');
  const channel = telegramToken ? new TelegramGateway(http, telegramToken) : new RecordingChannel();
  const notifications = new NotificationController(channel, accounts, alertStore);
  const clusters = new InMemoryClusterStore();
  const rainfall = new InMemoryRainfallStore();
  const runs = new InMemoryIngestionRunStore();
  const scores = new InMemoryPriorityScoreStore();
  const audit = new InMemoryAuditStore();
  const workOrders = new InMemoryWorkOrderStore();
  const treatments = new InMemoryTreatmentRecordStore();
  const notifier = new RecordingNotifier();
  const reports = new InMemoryReportStore();
  const locator = new InMemoryClusterLocator(clusters);
  const reportLifecycle = new ReportLifecycleController(new ReportTransitionTable(), reports, notifier);
  const moderation = new ModerationController(ac0, reports, reportLifecycle);
  const residentReports = new ReportController(ac0, reports, locator, reportLifecycle);
  const alertTriggers = new AlertTriggerEvaluator(savedLocations, subscriptions, alertStore, locator);
  // 9.1.x — the map and the trend view read the same stores everything else writes to; nothing
  // here computes a second version of a score or a boundary.
  const mapView = new MapViewController(
    ac0,
    clusters,
    scores,
    new TrendAnalyser(clusters),
    reports,
    workOrders,
    savedLocations,
  );
  const locations = new SavedLocationController(ac0, savedLocations, locator, geocoding, subscriptions, {
    // 1.2.5-1.2.8 for an arbitrary point rather than a cluster centroid — the same accumulator,
    // asked about a resident's home.
    forPoint: async (point, at) => {
      const stations = await rainfall.stations();
      const readings = await rainfall.readingsSince(new Date(at.getTime() - 72 * 3_600_000));
      return stations.length === 0 || readings.length === 0
        ? null
        : accumulator.accumulate(point, stations, readings, at);
    },
  });

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

    // 4.1.3 is no longer degraded: reports exist, and a cluster with none genuinely has zero
    // (5.2.5). Only rainfall can still go missing, and missing is not the same as zero.
    const stale: Driver[] = [];
    if (rainRun.outcome === 'FAILED') {
      stale.push(Driver.Rainfall24h, Driver.Rainfall72h);
    }
    engine.markStale(stale);

    const now = new Date();
    const stations = await rainfall.stations();
    const readings = await rainfall.readingsSince(new Date(now.getTime() - 72 * 3_600_000));
    const reportCounts = await moderation.verifiedOpenCounts(active.map((c) => c.id));
    const inputs = new Map<string, DriverInputs>();
    for (const cluster of active) {
      const rain =
        stations.length === 0 || readings.length === 0
          ? null
          : accumulator.accumulate(cluster.boundary.centroid(), stations, readings, now);
      inputs.set(cluster.id, {
        rainfall24h: rain?.accum24hMm,
        rainfall72h: rain?.accum72hMm,
        verifiedOpenReports: reportCounts.get(cluster.id) ?? 0, // 4.1.3 via 5.2.5
        // 4.1.15/4.1.16 — measured from the last verified treatment now that work orders exist,
        // defaulting to 90 days when a cluster has never been treated.
        daysSinceLastTreatment: await treatments.daysSinceLastTreatment(cluster.id, now),
      });
    }
    await engine.computeScores(active, inputs, now);
    // 3.1.8 — every saved location is re-evaluated against the boundaries this cycle just wrote.
    // After scoring rather than before: the clusters have to be current for the answer to be.
    const moved = await locations.evaluateAll(now);

    // 6.1.2, 6.1.3, 6.1.5 — decide, then deliver. The evaluator applies 6.1.9's daily cap before
    // anything is sent, so a cluster that grows every hour cannot produce an hourly message.
    const due = await alertTriggers.evaluate(
      { exposureChanges: moved, changedClusters: active.filter((c) => c.changeClass === ChangeClass.GROWN || c.heavyRainExpected) },
      now,
    );
    if (due.length > 0) {
      const tally = await notifications.deliverAll(due, now);
      console.log(`  alerts: ${tally.Sent} sent, ${tally.Failed} failed, ${tally.Suppressed} suppressed`);
    }
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

  // 3.1.15 — no more than 48 hours between refreshes. The gateway also refreshes lazily an hour
  // before expiry; this is the belt to that bracer, because a deployment that geocodes nothing for
  // four days would otherwise discover the lapsed token at the first request that matters.
  if (config.get('ONE_MAP_EMAIL')) {
    setInterval(
      () => void geocoding.refreshToken().catch((e: unknown) => console.error('OneMap token refresh failed:', e)),
      24 * 3_600_000,
    );
  }

  const ac = ac0;
  void audit;

  /**
   * 2.2.3 says only an Operations Manager may create a manager or crew account, and 2.2.2 makes
   * self-registration produce a Resident. A fresh deployment therefore has no way to reach the
   * operational roles at all — so the first manager is seeded here, from the environment, and the
   * fact is printed rather than hidden. A real deployment does this once, from a migration.
   */
  const seedEmail = process.env.DFENCE_SEED_MANAGER_EMAIL ?? 'manager@d-fence.local';
  const seedPassword = process.env.DFENCE_SEED_MANAGER_PASSWORD ?? 'dfence2026';
  const seeded = await staff.createStaffAccount(
    seedEmail,
    Role.OperationsManager,
    seedPassword,
    // The seed has no manager to authorise it, so it is performed as the system. This is the only
    // call in the codebase that constructs a principal rather than resolving one.
    principalFor(Role.OperationsManager, 'system-seed'),
  );
  const seededManagerId = seeded.id;
  const dashboard = new DashboardController(ac, clusters, scores, runs, workOrders, reports);
  const lifecycle = new WorkOrderLifecycleController(
    new WorkOrderTransitionTable(),
    workOrders,
    treatments,
    notifier,
    // 8.2.4, 8.3.11 travel the same road as resident alerts now that E6 exists.
    // 8.5.3 — a verified work order is reflected in the next cycle; here, immediately.
    { rescoreCluster: async () => cycle('MANUAL') },
    reportLifecycle, // 5.2.7, 8.5.1, 8.5.2
  );
  const dispatch = new DispatchController(ac, lifecycle, workOrders, clusters, scores, notifier, reportLifecycle);
  void dispatch;

  // 2.3.6 — the resolver is the only way a request acquires a role, and every handler gets it.
  const app = new ExpressApp(authentication);
  app.mount(new DashboardRoutes(ac, dashboard));
  app.mount(new ReportRoutes(ac, residentReports));
  app.mount(new ModerationRoutes(ac, moderation));
  app.mount(new AuthRoutes(ac, authentication));
  app.mount(new AdminRoutes(ac, staff));
  app.mount(new LocationRoutes(ac, locations));
  app.mount(new AlertRoutes(ac, notifications, alertPreferences));
  app.mount(new MapRoutes(ac, mapView));
  // The stand-in dashboard page renders for the seeded manager. It is a **development page**, not
  // the graded screen (E10), and it is the one place left that does not resolve a session — an
  // HTML page cannot carry a bearer token. Every JSON route above does resolve one.
  app.page('/ops', async () => {
    const manager = principalFor(Role.OperationsManager, seededManagerId);
    return renderOpsDashboard(
      await dashboard.buildOverview(manager),
      await dashboard.buildPriorityTable(manager),
      await dashboard.buildAttentionPanel(manager),
    );
  });
  app.page('/', async () => Promise.resolve('<meta http-equiv="refresh" content="0; url=/ops">'));

  app.listen(Number(process.env.PORT ?? 3000));
  console.log(`  sign in as ${seedEmail} / ${seedPassword} (development seed)`);
}

void main().catch((error: unknown) => {
  console.error('server failed to start:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
