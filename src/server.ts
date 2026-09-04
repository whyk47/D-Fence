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
import { Database } from './persistence/Database';
import { ClusterRepository, PostgresClusterLocator } from './persistence/ClusterRepository';
import { IngestionRunRepository } from './persistence/IngestionRunRepository';
import { PriorityScoreRepository } from './persistence/PriorityScoreRepository';
import { RainfallRepository } from './persistence/RainfallRepository';
import { HttpClient } from './boundary/gateways/HttpClient';
import { NEAFeedGateway } from './boundary/gateways/NEAFeedGateway';
import { RainfallGateway } from './boundary/gateways/RainfallGateway';
import { ForecastGateway } from './boundary/gateways/ForecastGateway';
import { ExpressApp } from './boundary/http/ExpressApp';
import { DashboardRoutes } from './boundary/http/DashboardRoutes';
import { ReportRoutes } from './boundary/http/ReportRoutes';
import { ModerationRoutes } from './boundary/http/ModerationRoutes';
import { WorkOrderRoutes } from './boundary/http/WorkOrderRoutes';
import { CrewRoutes } from './boundary/http/CrewRoutes';
import { AuthRoutes } from './boundary/http/AuthRoutes';
import { AdminRoutes } from './boundary/http/AdminRoutes';
import { LocationRoutes } from './boundary/http/LocationRoutes';
import { AlertRoutes } from './boundary/http/AlertRoutes';
import { MapRoutes } from './boundary/http/MapRoutes';
import { PrivacyRoutes } from './boundary/http/PrivacyRoutes';
import {
  InMemoryAuditStore,
  InMemoryClusterStore,
  InMemoryIngestionRunStore,
  InMemoryForecastStore,
  InMemoryPriorityScoreStore,
  InMemoryRainfallStore,
} from './persistence/memory/InMemoryStores';
import { InMemoryTreatmentRecordStore, InMemoryWorkOrderStore, RecordingNotifier } from './persistence/memory/InMemoryWorkOrderStores';
import { InMemoryClusterLocator, InMemoryReportStore } from './persistence/memory/InMemoryReportStores';
import { AccountStore, SessionStore } from './ports/Stores';
import { Account } from './entity/Account';
import { Uuid } from './entity/valueTypes';
import { AccountRepository, SessionRepository } from './persistence/AccountRepository';
import { ReportRepository } from './persistence/ReportRepository';
import { TreatmentRecordRepository, WorkOrderRepository } from './persistence/WorkOrderRepository';
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
import { TelegramLinkController } from './control/TelegramLinkController';
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
import { SourceHealthController } from './control/SourceHealthController';
import { IngestionController } from './control/IngestionController';
import { AbstractIngestionJob } from './control/ingestion/AbstractIngestionJob';
import { AnalyticsController } from './control/AnalyticsController';
import { PrivacyController } from './control/PrivacyController';
import { ClusterIngestionJob } from './control/ingestion/ClusterIngestionJob';
import { RainfallIngestionJob } from './control/ingestion/RainfallIngestionJob';
import { ForecastIngestionJob } from './control/ingestion/ForecastIngestionJob';
import { RainfallAccumulator } from './control/RainfallAccumulator';
import { NormalisationFactory } from './control/normalisation/NormalisationFactory';
import { PriorityScoringEngine, DriverInputs } from './control/PriorityScoringEngine';
import { ChangeClass, Driver, Role, SourceKind } from './entity/enums';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * One decision, made once: is there a database, and therefore which stores does this process run on?
 *
 * It lives in a function above `main` because the authentication controllers are built at the top of
 * `main`, before the persistence block, and reading `DATABASE_URL` twice in two places is how the
 * two halves of a process end up disagreeing about whether they are persistent.
 */
function bindAccountStores(connectionString: string): {
  database: Database | null;
  accounts: AccountStore;
  sessions: SessionStore;
} {
  const database = connectionString === '' ? null : new Database(connectionString);
  return {
    database,
    accounts: database === null ? new InMemoryAccountStore() : new AccountRepository(database),
    sessions: database === null ? new InMemorySessionStore() : new SessionRepository(database),
  };
}

/**
 * The first configured value. `??` is wrong against ConfigSet.get, which returns '' for an
 * absent key rather than undefined, so a fallback chain built on `??` never falls through.
 */
function firstConfigured(...values: Array<string | undefined>): string {
  return values.find((v) => v !== undefined && v !== '') ?? '';
}

async function main(): Promise<void> {
  const config = ConfigLoader.load();
  const http = new HttpClient();

  const auditStore = new InMemoryAuditStore();
  const ac0 = new AccessControlService(new AccessPolicy(), auditStore);
  // Bound below, once `database` is known — declared here because the authentication controllers
  // are constructed before the persistence choice is made.
  const accountsAndSessions = bindAccountStores(config.get('DATABASE_URL'));
  const accounts = accountsAndSessions.accounts;
  const sessions = accountsAndSessions.sessions;
  const database = accountsAndSessions.database;
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
  const alertPreferences = new AlertPreferenceController(ac0, subscriptions, savedLocations, auditStore);

  const alertStore = new InMemoryAlertStore();
  // 6.1.6 needs a bot token. Without one the recording channel keeps §6 runnable and testable —
  // and, unlike a silent no-op, it keeps a record of what *would* have been sent, so the alert
  // path can be demonstrated before the token arrives.
  const telegramToken = config.get('TELEGRAM_BOT_TOKEN');
  const telegram = telegramToken ? new TelegramGateway(http, telegramToken) : null;
  const channel = telegram ?? new RecordingChannel();
  const notifications = new NotificationController(channel, accounts, alertStore);
  // 6.1.7's inbound half. Without it a code can be issued and typed into Telegram and nothing
  // happens — the claim route exists, but the bot is the only caller and it was not listening.
  const telegramLink = telegram === null ? null : new TelegramLinkController(telegram, notifications);
  /**
   * The ports layer earning its keep, in four lines rather than in an argument.
   *
   * With DATABASE_URL set, the ingestion and scoring path runs on Postgres and history survives a
   * restart — which is what 10.2.3 asks for and what 7.3.1's 30-day chart needs in order to ever
   * show more than today. Without it, the in-memory stores keep the whole system runnable, which
   * is how every epic before this one was built and demonstrated.
   *
   * The stores NOT yet migrated (accounts, sessions, locations, alerts, forecasts, audit) stay in
   * memory in both modes. That is stated rather than hidden: a half-migrated system that looked
   * fully persistent would be a worse claim than an honestly mixed one.
   */
  const clusters = database === null ? new InMemoryClusterStore() : new ClusterRepository(database);
  const rainfall = database === null ? new InMemoryRainfallStore() : new RainfallRepository(database);
  const runs = database === null ? new InMemoryIngestionRunStore() : new IngestionRunRepository(database);
  const scores = database === null ? new InMemoryPriorityScoreStore() : new PriorityScoreRepository(database);
  const forecasts = new InMemoryForecastStore();
  console.log(
    database === null
      ? 'Persistence: in-memory (no DATABASE_URL) — a restart loses cluster history.'
      : 'Persistence: Postgres for accounts, sessions, clusters, rainfall, runs, scores, reports, '
        + 'work orders and treatments; in-memory for saved locations, alerts, forecasts and audit. '
        + 'Credentials live in the development auth provider and do NOT survive a restart.',
  );
  // Reports and work orders were the two that mattered most after the ingestion path: without
  // them a restart forgets every report a resident filed and every job a crew did, which makes
  // 7.3.4 and 7.3.5's thirty-day charts incapable of ever showing more than today.
  const workOrders = database === null ? new InMemoryWorkOrderStore() : new WorkOrderRepository(database);
  const treatments =
    database === null ? new InMemoryTreatmentRecordStore() : new TreatmentRecordRepository(database);
  const notifier = new RecordingNotifier();
  const reports = database === null ? new InMemoryReportStore() : new ReportRepository(database);
  // 3.1.8, 5.1.7 — exactly ONE containment implementation is bound per process. With a
  // database, PostGIS answers it; without one, the development locator does. Binding both
  // would be the second answer the warning on Polygon.contains exists to forbid.
  const locator =
    database === null
      ? new InMemoryClusterLocator(clusters)
      : new PostgresClusterLocator(clusters as ClusterRepository);
  // 2.4.1 — every controller that writes state gets the SAME audit store the access-control
  // service denies into, so a refusal and the change it would have made sit in one log.
  const reportLifecycle = new ReportLifecycleController(new ReportTransitionTable(), reports, notifier, auditStore);
  const moderation = new ModerationController(ac0, reports, reportLifecycle);
  const residentReports = new ReportController(ac0, reports, locator, reportLifecycle, auditStore);
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
  }, auditStore);

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
  // 1.3.x — runs after the cluster job in every cycle, because it derives onto whatever clusters
  // that job just wrote. A forecast joined to yesterday's cluster list is a flag on the wrong map.
  const forecastJob = new ForecastIngestionJob(new ForecastGateway(http), runs, forecasts, clusters);

  const engine = new PriorityScoringEngine(NormalisationFactory.build(config.normalisation), config, scores);
  const accumulator = new RainfallAccumulator();

  /** One full cycle: ingest both sources, then score. Scheduled, and run once at boot. */
  async function cycle(trigger: 'SCHEDULED' | 'MANUAL' = 'SCHEDULED'): Promise<void> {
    const clusterRun = await clusterJob.run(trigger);
    const rainRun = await rainJob.run(trigger);
    // 1.3.1 allows six hours between forecast retrievals, so this is throttled rather than run on
    // the five-minute rainfall beat — 288 requests a day for a payload that changes four times is
    // exactly the discourtesy 10.4.6 asks us not to commit against a free public API.
    const forecastRun = await forecastCycle(trigger);
    await scoreAndAlert(rainRun.outcome === 'FAILED');
    console.log(
      `cycle: clusters ${clusterRun.outcome} (${clusterRun.featureCount}), ` +
        `rainfall ${rainRun.outcome} (${rainRun.featureCount}), ` +
        `forecast ${forecastRun ?? 'SKIPPED'}`,
    );
  }

  /**
   * The half of a cycle that follows ingestion: score, re-evaluate exposure, evaluate and deliver
   * alerts. Split out so 1.1.18's manual trigger runs *this* rather than a second copy of it —
   * `IngestionController` runs the jobs itself and then calls in here, and the two paths cannot
   * drift because there is only one.
   *
   * @param rainfallFailed the rainfall drivers are marked stale rather than treated as zero
   *   (10.2.2). Missing is not the same as none, and scoring them as none would quietly rank a
   *   drenched cluster as dry.
   */
  async function scoreAndAlert(rainfallFailed: boolean): Promise<void> {
    const active = await clusters.findActive();
    if (active.length === 0) {
      return;
    }

    // 4.1.3 is no longer degraded: reports exist, and a cluster with none genuinely has zero
    // (5.2.5). Only rainfall can still go missing, and missing is not the same as zero.
    const stale: Driver[] = [];
    if (rainfallFailed) {
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
    console.log(`  scored ${active.length} active cluster(s)`);
  }

  /**
   * 1.3.1 — at most one forecast retrieval per interval, whatever the cycle's own cadence is.
   * Returns the outcome, or null when the interval has not elapsed, so the cycle log can tell a
   * skipped fetch from a failed one.
   */
  let lastForecastAt = 0;
  const forecastInterval = (config.ingestionIntervals.get(SourceKind.Forecast) ?? 6 * 3600) * 1000;
  async function forecastCycle(trigger: 'SCHEDULED' | 'MANUAL'): Promise<string | null> {
    if (trigger === 'SCHEDULED' && Date.now() - lastForecastAt < forecastInterval) {
      return null;
    }
    lastForecastAt = Date.now();
    const run = await forecastJob.run(trigger);
    if (forecastJob.outsideEveryRegion.length > 0) {
      // 1.3.2's fallback fired. Not an error, but the count is the signal that the region boxes
      // in ForecastRegionMap have drifted from where the feed is actually putting clusters.
      console.log(`  forecast: ${forecastJob.outsideEveryRegion.length} cluster(s) took the nearest-region fallback`);
    }
    return `${run.outcome} (${run.featureCount} cluster(s) flagged)`;
  }

  if (telegramLink !== null) {
    telegramLink.start();
    console.log('Telegram: bot online, polling for link codes (6.1.7).');
  } else {
    console.log('Telegram: no TELEGRAM_BOT_TOKEN — alerts will be recorded rather than sent (6.1.6).');
  }

  // **Not awaited, and the ordering matters.** This used to run to completion before `listen()`,
  // which made the server unreachable for the thirty-odd seconds it takes to fetch three public
  // APIs and score. On a laptop that is a nuisance; on a host it is a failed deployment, because a
  // platform health check against a port nothing is listening on concludes the container is broken
  // and restarts it — forever, since every restart begins with the same thirty seconds.
  //
  // Deferring it is safe in a way it would not have been before the database: the stores are
  // populated from the previous run, so a request arriving during the first cycle is answered from
  // persisted data rather than from an empty Map. It is served slightly stale, which 10.2.2 already
  // requires the system to do gracefully and 1.4.4 already marks on the screen.
  const primed = cycle('MANUAL').catch((e: unknown) => console.error('first cycle failed:', e));

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

  /**
   * 2.2.3 says only an Operations Manager may create a manager or crew account, and 2.2.2 makes
   * self-registration produce a Resident. A fresh deployment therefore has no way to reach the
   * operational roles at all — so the first manager is seeded here, from the environment, and the
   * fact is printed rather than hidden. A real deployment does this once, from a migration.
   */
  // Resolved through the same precedence as every other setting — environment first, then
  // `src/.env`, then the development default. Reading `process.env` alone made this the one
  // credential in the system that `src/.env` could not configure: the acceptance harnesses took the
  // configured password while the server seeded the published default, so the two disagreed and the
  // manager sign-in failed against a completely healthy application. Env still wins, which is what
  // App Service needs.
  const seedEmail = firstConfigured(process.env.DFENCE_SEED_MANAGER_EMAIL, config.get('DFENCE_SEED_MANAGER_EMAIL'), 'manager@d-fence.local');
  const seedPassword = firstConfigured(process.env.DFENCE_SEED_MANAGER_PASSWORD, config.get('DFENCE_SEED_MANAGER_PASSWORD'), 'dfence2026');
  //
  // With a database the account survives the restart but the credential does not: `LocalAuthProvider`
  // is the development stand-in for Supabase Auth and holds its scrypt hashes in memory (10.3.1 —
  // the provider owns the credential, and there is deliberately no password column in this schema).
  // So a second boot re-binds the stored account to a fresh provider identity rather than creating a
  // second account and failing 2.1.4. Re-seeding blindly would abort startup on every restart after
  // the first, which is the sort of breakage that only appears in the demonstration.
  const existingSeed = await accounts.findByEmail(seedEmail);
  const seededManagerId =
    existingSeed === null
      ? (
          await staff.createStaffAccount(
            seedEmail,
            Role.OperationsManager,
            seedPassword,
            // The seed has no manager to authorise it, so it is performed as the system. This is the
            // only call in the codebase that constructs a principal rather than resolving one.
            principalFor(Role.OperationsManager, 'system-seed'),
          )
        ).id
      : await rebindSeed(existingSeed);

  async function rebindSeed(account: Account): Promise<Uuid> {
    account.authUserId = await authProvider.createUser({ email: seedEmail, password: seedPassword });
    account.emailVerified = true;
    account.isActive = true;
    account.clearFailedAttempts();
    await accounts.save(account);
    return account.id;
  }
  // 1.4.1-1.4.4 — all four sources, with the intervals 1.4.3 counts taken from configuration
  // (10.6.2) rather than from constants, and the geocoder reporting for itself (3.1.16).
  const sourceHealth = new SourceHealthController(runs, config.ingestionIntervals, geocoding);
  const dashboard = new DashboardController(ac, clusters, scores, runs, workOrders, reports, sourceHealth);
  // 1.1.18 — the manual trigger runs the same three jobs the scheduler runs, then the same
  // scoring half, and answers with the health panel as it stands afterwards. The geocoder is
  // absent on purpose: it has no ingestion job (3.1.16).
  const ingestion = new IngestionController(
    ac,
    new Map<SourceKind, AbstractIngestionJob>([
      [SourceKind.Clusters, clusterJob],
      [SourceKind.Rainfall, rainJob],
      [SourceKind.Forecast, forecastJob],
    ]),
    sourceHealth,
    { rescore: (rainfallFailed: boolean) => scoreAndAlert(rainfallFailed) },
  );
  const lifecycle = new WorkOrderLifecycleController(
    new WorkOrderTransitionTable(),
    workOrders,
    treatments,
    notifier,
    // 8.2.4, 8.3.11 travel the same road as resident alerts now that E6 exists.
    // 8.5.3 — a verified work order is reflected in the next cycle; here, immediately.
    { rescoreCluster: async () => cycle('MANUAL') },
    reportLifecycle, // 5.2.7, 8.5.1, 8.5.2
    auditStore, // 2.4.1 — the single write path for status is the single audit point
  );
  const dispatch = new DispatchController(
    ac, lifecycle, workOrders, clusters, scores, notifier, reportLifecycle, 10, auditStore,
  );
  void dispatch;

  // 2.3.6 — the resolver is the only way a request acquires a role, and every handler gets it.
  // 10.3.2 — off on localhost, which has no certificate, and on wherever DFENCE_REQUIRE_HTTPS
  // is set. The flag is explicit rather than inferred from NODE_ENV: a security control that
  // switches itself on by guessing the environment is one that can guess wrong.
  const app = new ExpressApp(authentication, process.env.DFENCE_REQUIRE_HTTPS === 'true');
  // 7.3.1-7.3.5 — the five charts, over the same stores everything else reads.
  const analytics = new AnalyticsController(ac, clusters, scores, workOrders, reports);
  app.mount(new DashboardRoutes(ac, dashboard, analytics, ingestion));
  app.mount(new ReportRoutes(ac, residentReports));
  app.mount(new ModerationRoutes(ac, moderation));
  app.mount(new AuthRoutes(ac, authentication));
  app.mount(new AdminRoutes(ac, staff));
  app.mount(new LocationRoutes(ac, locations));
  app.mount(new AlertRoutes(ac, notifications, alertPreferences));
  app.mount(new MapRoutes(ac, mapView));
  // §8's two halves, finally reachable over HTTP. Both were declared skeletons that threw, so the
  // dispatch, work-order and crew screens had controllers behind them and no door to reach them by.
  app.mount(new WorkOrderRoutes(ac, dispatch, lifecycle, staff));
  app.mount(new CrewRoutes(ac, dispatch, lifecycle));
  // 10.4.3, 10.4.4 — deletion, and the attribution every government source obliges us to show.
  app.mount(
    new PrivacyRoutes(
      ac,
      new PrivacyController(ac, accounts, savedLocations, reports, subscriptions, authProvider, auditStore),
    ),
  );
  /**
   * The React client, and the end of the server-rendered stand-in.
   *
   * `/ops` used to be a development page rendered for the seeded manager without resolving a
   * session — an HTML page cannot carry a bearer token. It is **deleted** rather than kept
   * alongside, because `/ops` is now a real client route (11.2.12) and two implementations of one
   * screen is the drift every review of this project has found. It also could not have coexisted:
   * the server route would have shadowed the client's.
   *
   * Mounted last, deliberately. The catch-all inside `serveClient` answers everything unmatched, so
   * registered any earlier it would swallow the API.
   */
  const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'client', 'dist');
  if (existsSync(join(clientDir, 'index.html'))) {
    app.serveClient(clientDir);
  } else {
    console.log('Client bundle not found — run `npm run build:client`. The API still works.');
  }

  app.listen(Number(process.env.PORT ?? 3000));
  // The password is printed ONLY when it is the published development default, where printing it
  // costs nothing and saves a reader a trip to the source. A password supplied through the
  // environment is a real one, and printing it would write it into whatever collects stdout — on
  // App Service that is a log stream any co-owner can tail, which turns a well-chosen credential
  // back into a published one. Setting DFENCE_SEED_MANAGER_PASSWORD is what makes it a secret.
  // Compared against the default itself rather than against "was an environment variable set":
  // the password now also resolves from src/.env, and the question that matters is whether this
  // credential is already published, not which mechanism supplied it.
  const seedIsDefault = seedPassword === 'dfence2026';
  console.log(
    seedIsDefault
      ? `  sign in as ${seedEmail} / ${seedPassword} (development seed)`
      : `  sign in as ${seedEmail} (password from DFENCE_SEED_MANAGER_PASSWORD, not printed)`,
  );

  // Awaited *after* listening, so the log still reports the first cycle's outcome in order and a
  // failure is still visible — the point of deferring it was reachability, not silence.
  console.log('Priming the first cycle in the background…');
  await primed;
}

void main().catch((error: unknown) => {
  console.error('server failed to start:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
