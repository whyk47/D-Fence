/**
 * D-Fence — Lab 4 §3.2: resident alerts (§6).
 *
 * The rules worth testing here are the ones that stop this feature becoming spam.
 *
 *  - **6.1.2 is a transition, not a state.** Alerting because a location *is* in a cluster would
 *    re-alert every hour for as long as the cluster exists.
 *  - **6.1.9 caps per location per trigger per day**, and the cap has to hold within a single
 *    batch as well as against what was sent yesterday.
 *  - **6.1.11 retries twice at five-minute intervals**, and FAILED is recorded only after the
 *    third attempt — which is testable only because the schedule is a port.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { AccessControlService, NotAuthorised } from '../src/control/AccessControlService';
import { AccessPolicy } from '../src/control/AccessPolicy';
import { AlertTriggerEvaluator, ALERT_COOLDOWN_MS } from '../src/control/AlertTriggerEvaluator';
import { AlertPreferenceController, AlertPreferenceRejected } from '../src/control/AlertPreferenceController';
import {
  NotificationController,
  RetryScheduler,
  MAX_DELIVERY_ATTEMPTS,
  RETRY_INTERVAL_MS,
  LINK_CODE_TTL_MS,
} from '../src/control/NotificationController';
import { InMemoryClusterStore, InMemoryAuditStore } from '../src/persistence/memory/InMemoryStores';
import { InMemoryClusterLocator } from '../src/persistence/memory/InMemoryReportStores';
import { InMemorySavedLocationStore } from '../src/persistence/memory/InMemoryLocationStores';
import {
  InMemoryAlertStore,
  InMemoryAlertSubscriptionStore,
  RecordingChannel,
} from '../src/persistence/memory/InMemoryAlertStores';
import { InMemoryAccountStore } from '../src/persistence/memory/InMemoryAccountStores';
import { Cluster } from '../src/entity/Cluster';
import { Account } from '../src/entity/Account';
import { Alert } from '../src/entity/Alert';
import { AlertSubscription, DEFAULT_GROWTH_THRESHOLD } from '../src/entity/AlertSubscription';
import { SavedLocation } from '../src/entity/SavedLocation';
import { GeoPoint, Polygon, PremisesMix } from '../src/entity/valueTypes';
import {
  AlertTrigger,
  ChangeClass,
  DeliveryOutcome,
  ExposureStatus,
  LocationLabel,
  Role,
} from '../src/entity/enums';
import { Principal } from '../src/control/Principal';

const RESIDENT = new Principal('resident-1', Role.Resident, 'session-r1');
const OTHER = new Principal('resident-2', Role.Resident, 'session-r2');
const CENTRE = new GeoPoint(1.4300, 103.7900);
const CHAT_ID = '987654321';

/** A scheduler that records what was asked for instead of waiting. */
class ManualScheduler implements RetryScheduler {
  readonly queued: Array<{ delayMs: number; run: () => Promise<void> }> = [];

  after(delayMs: number, run: () => Promise<void>): void {
    this.queued.push({ delayMs, run });
  }

  /** Fires everything currently queued. Anything queued *by* those runs waits for the next call. */
  async fire(): Promise<void> {
    const due = this.queued.splice(0, this.queued.length);
    for (const item of due) {
      await item.run();
    }
  }
}

interface Fixture {
  evaluator: AlertTriggerEvaluator;
  notifications: NotificationController;
  preferences: AlertPreferenceController;
  locations: InMemorySavedLocationStore;
  subscriptions: InMemoryAlertSubscriptionStore;
  alerts: InMemoryAlertStore;
  channel: RecordingChannel;
  scheduler: ManualScheduler;
  accounts: InMemoryAccountStore;
  cluster: Cluster;
  location: SavedLocation;
}

async function fixture(options: { linkChat?: boolean } = {}): Promise<Fixture> {
  const clusters = new InMemoryClusterStore();
  const cluster = new Cluster();
  cluster.objectId = 'c-1';
  cluster.locality = 'Marsiling Rise';
  cluster.caseSize = 31;
  cluster.caseDelta = 0;
  cluster.changeClass = ChangeClass.UNCHANGED;
  cluster.heavyRainExpected = false;
  cluster.isActive = true;
  cluster.premisesMix = new PremisesMix(['Bin'], [], []);
  const d = 200 / 111_320;
  cluster.boundary = new Polygon([
    [
      new GeoPoint(CENTRE.latitude - d, CENTRE.longitude - d),
      new GeoPoint(CENTRE.latitude + d, CENTRE.longitude - d),
      new GeoPoint(CENTRE.latitude + d, CENTRE.longitude + d),
      new GeoPoint(CENTRE.latitude - d, CENTRE.longitude + d),
      new GeoPoint(CENTRE.latitude - d, CENTRE.longitude - d),
    ],
  ]);
  await clusters.upsertFromFeed({ retrievedAt: new Date('2026-09-03T10:06:00+08:00'), records: [cluster] });
  const storedCluster = (await clusters.findActive())[0] as Cluster;

  const accounts = new InMemoryAccountStore();
  const account = new Account();
  account.id = RESIDENT.accountId;
  account.email = 'ah.seng@example.com';
  account.authUserId = 'auth-1';
  account.emailVerified = true;
  account.role = Role.Resident;
  account.isActive = true;
  account.telegramChatId = options.linkChat === false ? null : CHAT_ID;
  account.createdAt = new Date();
  await accounts.save(account);

  const locations = new InMemorySavedLocationStore();
  const location = new SavedLocation();
  location.accountId = RESIDENT.accountId;
  location.inputText = '730123';
  location.resolvedAddress = 'BLK 123 MARSILING RISE';
  location.point = CENTRE;
  location.label = LocationLabel.Home;
  location.name = 'Home';
  location.exposureStatus = ExposureStatus.IN_CLUSTER;
  location.exposure = {
    clusterId: storedCluster.id,
    clusterLocality: storedCluster.locality,
    caseSize: storedCluster.caseSize,
    distanceMetres: 0,
    dataTimestamp: storedCluster.lastUpdatedAt,
  };
  location.rain24hMm = null;
  location.rain72hMm = null;
  location.evaluatedAt = new Date();
  const storedLocation = await locations.save(location);

  const subscriptions = new InMemoryAlertSubscriptionStore();
  const alerts = new InMemoryAlertStore();
  const channel = new RecordingChannel();
  const scheduler = new ManualScheduler();
  const ac = new AccessControlService(new AccessPolicy(), new InMemoryAuditStore());

  return {
    evaluator: new AlertTriggerEvaluator(locations, subscriptions, alerts, new InMemoryClusterLocator(clusters)),
    notifications: new NotificationController(channel, accounts, alerts, scheduler),
    preferences: new AlertPreferenceController(ac, subscriptions, locations),
    locations,
    subscriptions,
    alerts,
    channel,
    scheduler,
    accounts,
    cluster: storedCluster,
    location: storedLocation,
  };
}

/** Turns alerts on for the fixture's location. */
async function subscribe(f: Fixture, changes: Partial<AlertSubscription> = {}): Promise<AlertSubscription> {
  const subscription = AlertSubscription.create(f.location.id, RESIDENT.accountId);
  Object.assign(subscription, changes);
  return f.subscriptions.save(subscription);
}

/** The exposure change that 6.1.2 fires on. */
function entered(f: Fixture): { location: SavedLocation; from: ExposureStatus } {
  return { location: f.location, from: ExposureStatus.CLEAR };
}

describe('Triggers — §6.1.1 to §6.1.5', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('T1 — becoming IN_CLUSTER generates an alert (6.1.2)', async () => {
    await subscribe(f);
    const due = await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] });
    expect(due).toHaveLength(1);
    expect(due[0]?.triggerType).toBe(AlertTrigger.EnteredCluster);
  });

  it('T2 — being IN_CLUSTER without changing generates nothing (6.1.2)', async () => {
    await subscribe(f);
    // The transition is the event. Alerting on the state would re-alert every cycle for weeks.
    const due = await f.evaluator.evaluate({
      exposureChanges: [{ location: f.location, from: ExposureStatus.IN_CLUSTER }],
      changedClusters: [],
    });
    expect(due).toHaveLength(0);
  });

  it('T3 — a location with no subscription gets nothing (6.1.1)', async () => {
    // No subscription at all: defaulting to "on" would message somebody who never opted in.
    const due = await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] });
    expect(due).toHaveLength(0);
  });

  it('T4 — a disabled subscription gets nothing (6.1.1)', async () => {
    await subscribe(f, { enabled: false });
    expect(await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] })).toHaveLength(0);
  });

  it('T5 — muting one trigger leaves the others working (6.1.1)', async () => {
    await subscribe(f, { triggers: [AlertTrigger.ClusterGrowth] });
    expect(await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] })).toHaveLength(0);

    f.cluster.changeClass = ChangeClass.GROWN;
    f.cluster.caseDelta = DEFAULT_GROWTH_THRESHOLD;
    const due = await f.evaluator.evaluate({ exposureChanges: [], changedClusters: [f.cluster] });
    expect(due[0]?.triggerType).toBe(AlertTrigger.ClusterGrowth);
  });

  it('T6 — growth of five alerts, four does not (6.1.3, 6.1.4, boundary)', async () => {
    await subscribe(f);
    f.cluster.changeClass = ChangeClass.GROWN;

    f.cluster.caseDelta = DEFAULT_GROWTH_THRESHOLD - 1;
    expect(await f.evaluator.evaluate({ exposureChanges: [], changedClusters: [f.cluster] })).toHaveLength(0);

    f.cluster.caseDelta = DEFAULT_GROWTH_THRESHOLD;
    expect(await f.evaluator.evaluate({ exposureChanges: [], changedClusters: [f.cluster] })).toHaveLength(1);
  });

  it('T7 — a resident may raise their own threshold (6.1.3)', async () => {
    await subscribe(f, { growthThreshold: 20 });
    f.cluster.changeClass = ChangeClass.GROWN;
    f.cluster.caseDelta = 10;
    expect(await f.evaluator.evaluate({ exposureChanges: [], changedClusters: [f.cluster] })).toHaveLength(0);
  });

  it('T8 — heavy rain forecast for a containing cluster alerts (6.1.5)', async () => {
    await subscribe(f);
    f.cluster.heavyRainExpected = true;
    const due = await f.evaluator.evaluate({ exposureChanges: [], changedClusters: [f.cluster] });
    expect(due.map((a) => a.triggerType)).toEqual([AlertTrigger.HeavyRainForecast]);
  });

  it('T9 — growth in a cluster a location is only NEAR does not alert (6.1.3)', async () => {
    await subscribe(f);
    f.location.exposureStatus = ExposureStatus.WITHIN_150M;
    await f.locations.save(f.location);
    f.cluster.changeClass = ChangeClass.GROWN;
    f.cluster.caseDelta = 50;
    // 6.1.3 says "the cluster *containing* a saved location". Near is not in.
    expect(await f.evaluator.evaluate({ exposureChanges: [], changedClusters: [f.cluster] })).toHaveLength(0);
  });
});

describe('The daily cap — §6.1.9', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
    await subscribe(f);
  });

  it('C1 — a second alert of the same type within 24 hours is suppressed', async () => {
    const first = await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] });
    await f.notifications.deliverAll(first);
    const second = await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] });
    expect(second).toHaveLength(0);
  });

  it('C2 — the same type is allowed again after 24 hours (boundary)', async () => {
    const at = new Date('2026-09-03T08:00:00+08:00');
    await f.notifications.deliverAll(
      await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] }, at),
      at,
    );
    const justInside = new Date(at.getTime() + ALERT_COOLDOWN_MS - 1000);
    const justOutside = new Date(at.getTime() + ALERT_COOLDOWN_MS + 1000);
    expect(await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] }, justInside)).toHaveLength(0);
    expect(await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] }, justOutside)).toHaveLength(1);
  });

  it('C3 — a different trigger type is NOT capped by the first (6.1.9)', async () => {
    await f.notifications.deliverAll(await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] }));
    f.cluster.heavyRainExpected = true;
    // The cap is per location per *trigger type*: entering a cluster and rain being forecast are
    // different things to be told.
    expect(await f.evaluator.evaluate({ exposureChanges: [], changedClusters: [f.cluster] })).toHaveLength(1);
  });

  it('C4 — the cap holds within a single batch, not just against yesterday', async () => {
    // Two triggers for one location in one evaluation. Checked only against the store, both would
    // pass, because nothing has been written yet.
    f.cluster.heavyRainExpected = true;
    const due = await f.evaluator.evaluate({
      exposureChanges: [],
      changedClusters: [f.cluster, f.cluster],
    });
    expect(due).toHaveLength(1);
  });

  it('C5 — a FAILED delivery does not consume the day\'s allowance (6.1.9, 6.1.11)', async () => {
    f.channel.failNext = MAX_DELIVERY_ATTEMPTS;
    const first = await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] });
    await f.notifications.deliverAll(first);
    await f.scheduler.fire();
    await f.scheduler.fire();
    // 6.1.9 caps what a resident *receives*, and they received nothing.
    expect(await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] })).toHaveLength(1);
  });
});

describe('Delivery — §6.1.6, §6.1.8, §6.1.10, §6.1.11', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
    await subscribe(f);
  });

  it('D1 — the message carries all five required elements (6.1.8)', async () => {
    const due = await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] });
    const message = due[0]?.payload as string;
    expect(message).toContain('Home'); // location label
    expect(message).toContain('Marsiling Rise'); // cluster name
    expect(message).toContain('inside an active dengue cluster'); // trigger reason
    expect(message).toContain('31'); // case size
    expect(message).toMatch(/NEA data as at \d{4}-\d{2}-\d{2}/); // data timestamp
  });

  it('D2 — a successful delivery is logged as Sent (6.1.6, 6.1.10)', async () => {
    const due = await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] });
    expect(await f.notifications.notifyResident(due[0] as Alert)).toBe(DeliveryOutcome.Sent);
    expect(f.channel.to(CHAT_ID)).toHaveLength(1);
    expect((await f.alerts.recent(5))[0]?.outcome).toBe(DeliveryOutcome.Sent);
  });

  it('D3 — an account with no linked chat is Suppressed, not Failed (6.1.6, 6.1.10)', async () => {
    const g = await fixture({ linkChat: false });
    await subscribe(g);
    const due = await g.evaluator.evaluate({ exposureChanges: [entered(g)], changedClusters: [] });
    // Nothing went wrong; there is nowhere to send it. The log has to tell those apart.
    expect(await g.notifications.notifyResident(due[0] as Alert)).toBe(DeliveryOutcome.Suppressed);
  });

  it('D4 — a failure is retried twice at five-minute intervals, then recorded FAILED (6.1.11)', async () => {
    f.channel.failNext = MAX_DELIVERY_ATTEMPTS; // every attempt fails
    const due = await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] });
    await f.notifications.notifyResident(due[0] as Alert);

    expect(f.scheduler.queued[0]?.delayMs).toBe(RETRY_INTERVAL_MS);
    await f.scheduler.fire(); // attempt 2
    await f.scheduler.fire(); // attempt 3
    const logged = (await f.alerts.recent(5))[0] as Alert;
    expect(logged.attempts).toBe(MAX_DELIVERY_ATTEMPTS);
    expect(logged.outcome).toBe(DeliveryOutcome.Failed);
    // Three attempts in all, and no fourth: 6.1.11 says twice, not indefinitely.
    expect(f.scheduler.queued).toHaveLength(0);
  });

  it('D5 — a retry that succeeds records Sent and stops retrying (6.1.11)', async () => {
    f.channel.failNext = 1; // only the first attempt fails
    const due = await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] });
    await f.notifications.notifyResident(due[0] as Alert);
    await f.scheduler.fire();
    const logged = (await f.alerts.recent(5))[0] as Alert;
    expect(logged.outcome).toBe(DeliveryOutcome.Sent);
    expect(logged.attempts).toBe(2);
    expect(f.scheduler.queued).toHaveLength(0);
  });

  it('D6 — every alert is logged with recipient, trigger, timestamp and outcome (6.1.10)', async () => {
    const due = await f.evaluator.evaluate({ exposureChanges: [entered(f)], changedClusters: [] });
    await f.notifications.notifyResident(due[0] as Alert);
    const logged = (await f.alerts.recent(1))[0] as Alert;
    expect(logged.accountId).toBe(RESIDENT.accountId);
    expect(logged.triggerType).toBe(AlertTrigger.EnteredCluster);
    expect(logged.sentAt).toBeInstanceOf(Date);
    expect(logged.outcome).toBe(DeliveryOutcome.Sent);
  });
});

describe('Linking a Telegram chat — §6.1.7', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture({ linkChat: false });
  });

  it('K1 — a claimed code links the chat to the account (6.1.7)', async () => {
    const { code } = f.notifications.issueLinkCode(RESIDENT.accountId);
    expect(await f.notifications.claimLinkCode(code, CHAT_ID)).toBe(RESIDENT.accountId);
    expect((await f.accounts.findById(RESIDENT.accountId))?.telegramChatId).toBe(CHAT_ID);
  });

  it('K2 — a code is single-use (6.1.7)', async () => {
    const { code } = f.notifications.issueLinkCode(RESIDENT.accountId);
    await f.notifications.claimLinkCode(code, CHAT_ID);
    expect(await f.notifications.claimLinkCode(code, 'someone-else')).toBeNull();
  });

  it('K3 — a code expires after fifteen minutes (6.1.7, boundary)', async () => {
    const at = new Date('2026-09-03T10:00:00+08:00');
    const inTime = f.notifications.issueLinkCode(RESIDENT.accountId, at);
    expect(
      await f.notifications.claimLinkCode(inTime.code, CHAT_ID, new Date(at.getTime() + LINK_CODE_TTL_MS - 1000)),
    ).toBe(RESIDENT.accountId);

    const late = f.notifications.issueLinkCode(RESIDENT.accountId, at);
    expect(
      await f.notifications.claimLinkCode(late.code, CHAT_ID, new Date(at.getTime() + LINK_CODE_TTL_MS + 1000)),
    ).toBeNull();
  });

  it('K4 — a wrong code is consumed anyway, so it cannot be brute-forced by retrying', async () => {
    const { code } = f.notifications.issueLinkCode(RESIDENT.accountId);
    expect(await f.notifications.claimLinkCode('000000', CHAT_ID)).toBeNull();
    // The real code still works: only the attempted one is burned.
    expect(await f.notifications.claimLinkCode(code, CHAT_ID)).toBe(RESIDENT.accountId);
  });
});

describe('Preferences — §6.1.1, §6.1.3, §2.3.1', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('P1 — the first update creates the subscription, enabled, with the default threshold (6.1.4)', async () => {
    const subscription = await f.preferences.update(f.location.id, { enabled: true }, RESIDENT);
    expect(subscription.enabled).toBe(true);
    expect(subscription.growthThreshold).toBe(DEFAULT_GROWTH_THRESHOLD);
    expect(subscription.triggers).toHaveLength(3);
  });

  it('P2 — a resident cannot configure another resident\'s location (2.3.1)', async () => {
    await expect(f.preferences.update(f.location.id, { enabled: true }, OTHER)).rejects.toBeInstanceOf(NotAuthorised);
  });

  it('P3 — a threshold below one is refused (6.1.3)', async () => {
    for (const bad of [0, -1, 2.5]) {
      await expect(
        f.preferences.update(f.location.id, { growthThreshold: bad }, RESIDENT),
      ).rejects.toBeInstanceOf(AlertPreferenceRejected);
    }
  });

  it('P4 — an empty trigger list is refused; disable the location instead (6.1.1)', async () => {
    await expect(f.preferences.update(f.location.id, { triggers: [] }, RESIDENT)).rejects.toThrow(/at least one trigger/);
    await expect(f.preferences.update(f.location.id, { triggers: ['Nonsense'] }, RESIDENT)).rejects.toThrow(
      /at least one trigger/,
    );
  });

  it('P5 — an unknown location is refused rather than silently creating a subscription', async () => {
    await expect(f.preferences.update('no-such-location', { enabled: true }, RESIDENT)).rejects.toBeInstanceOf(
      NotAuthorised,
    );
  });
});
