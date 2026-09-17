/**
 * D-Fence — Lab 4 §2.24: the four Postgres repositories, against a live PostGIS.
 *
 * **Why these cannot be in-memory tests.** Every other test file in this suite runs against the
 * fakes in `InMemoryStores`, and that is the claim the ports layer exists to make (10.6.3). But
 * several guarantees are properties of *Postgres*, not of the interface, and an in-memory double
 * cannot fail them:
 *
 *  1. `ST_DWithin` on `geography` measures metres and is **inclusive**; the in-memory store's
 *     haversine approximation agrees only if both were written to the same rule (5.1.11).
 *  2. GeoJSON is `[longitude, latitude]` and the entity is `(latitude, longitude)`. A swap
 *     survives every unit test and puts a Singapore report in the Java Sea.
 *  3. `Report.status` and `WorkOrder.status` are **private**, so rehydration goes through
 *     `applyStatus`. A repository that forgot would return every row at its default status.
 *  4. `pg` returns a `date` column as a `Date` at *local* midnight, and `toISOString()` on it
 *     yields the previous day in Singapore. 8.3.12's completion date is a calendar date.
 *
 * The whole file skips when `DATABASE_URL` is unset, so `npm test` stays offline by default. It
 * cleans up after itself in `afterAll` and uses its own account and its own cluster, far from any
 * real one, so it can run against the shared development database without disturbing it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ConfigLoader } from '../src/config/ConfigLoader';
import { Database } from '../src/persistence/Database';
import { ReportRepository } from '../src/persistence/ReportRepository';
import { WorkOrderRepository, TreatmentRecordRepository } from '../src/persistence/WorkOrderRepository';
import { AccountRepository, SessionRepository } from '../src/persistence/AccountRepository';
import { ClusterRepository } from '../src/persistence/ClusterRepository';
import { AuditRepository } from '../src/persistence/AuditRepository';
import { CredentialRepository } from '../src/persistence/CredentialRepository';
import { LocalAuthProvider } from '../src/persistence/memory/InMemoryAccountStores';
import { AlertSubscriptionRepository, SavedLocationRepository } from '../src/persistence/SavedLocationRepository';
import { SavedLocation } from '../src/entity/SavedLocation';
import { AlertSubscription } from '../src/entity/AlertSubscription';
import { AlertTrigger, ExposureStatus, LocationLabel } from '../src/entity/enums';
import { Account } from '../src/entity/Account';
import { Session } from '../src/entity/Session';
import { Report } from '../src/entity/Report';
import { WorkOrder } from '../src/entity/WorkOrder';
import { TreatmentRecord } from '../src/entity/TreatmentRecord';
import { GeoPoint } from '../src/entity/valueTypes';
import { Role, ReportStatus, ReportType, TaskType, WorkOrderStatus, PriorityTier } from '../src/entity/enums';
import { RainfallRepository } from '../src/persistence/RainfallRepository';
import { RainfallAccumulator } from '../src/control/RainfallAccumulator';
import { ParsedReading, ParsedStation } from '../src/control/ingestion/RainfallFeedParser';
import { PriorityScoreRepository } from '../src/persistence/PriorityScoreRepository';
import { PriorityScore } from '../src/entity/PriorityScore';
import { PestType } from '../src/entity/enums';

const url = ConfigLoader.load().get('DATABASE_URL');
const live = url !== '';

/** A metre of latitude, in degrees. Used to place points at known distances apart. */
const METRE = 1 / 111_320;
/** In the Straits, well away from any real cluster, so nothing here collides with live data. */
const ORIGIN = new GeoPoint(1.2, 103.6);

describe.skipIf(!live)('Repositories against live PostGIS — §5.1.7, §5.1.11, §8.3.12, §2.1.9, §2.1.10', () => {
  let db: Database;
  let reports: ReportRepository;
  let workOrders: WorkOrderRepository;
  let treatments: TreatmentRecordRepository;
  let accounts: AccountRepository;
  let sessions: SessionRepository;
  let clusters: ClusterRepository;
  const accountId = randomUUID();
  const clusterId = randomUUID();

  beforeAll(async () => {
    db = new Database(url);
    reports = new ReportRepository(db);
    workOrders = new WorkOrderRepository(db);
    treatments = new TreatmentRecordRepository(db);
    accounts = new AccountRepository(db);
    sessions = new SessionRepository(db);
    clusters = new ClusterRepository(db);

    const account = new Account();
    account.id = accountId;
    account.email = 'repo-test-' + accountId.slice(0, 8) + '@d-fence.test';
    account.authUserId = 'auth-' + accountId;
    account.emailVerified = true;
    account.role = Role.Resident;
    account.isActive = true;
    account.telegramChatId = null;
    account.createdAt = new Date();
    await accounts.save(account);

    // A twenty-metre square around ORIGIN, inserted directly rather than through the feed path:
    // what is under test here is containment, not parsing, and `upsertFromFeed` would need a whole
    // ParsedBatch to say the same thing.
    const d = 10 * METRE;
    const ring = [
      [ORIGIN.longitude - d, ORIGIN.latitude - d],
      [ORIGIN.longitude + d, ORIGIN.latitude - d],
      [ORIGIN.longitude + d, ORIGIN.latitude + d],
      [ORIGIN.longitude - d, ORIGIN.latitude + d],
      [ORIGIN.longitude - d, ORIGIN.latitude - d],
    ]
      .map((pair) => pair[0] + ' ' + pair[1])
      .join(', ');
    await db.query(
      'INSERT INTO cluster (id, object_id, locality, boundary, case_size, change_class, trajectory, is_active) ' +
        "VALUES ($1, $2, 'Repository test site', ST_GeogFromText($3), 4, 'NEW', 'Stable', true)",
      [clusterId, 'test-' + accountId.slice(0, 8), 'POLYGON((' + ring + '))'],
    );
  }, 30_000);

  afterAll(async () => {
    if (db === undefined) {
      return;
    }
    // Order matters: `work_order` references `cluster` with ON DELETE RESTRICT, so the cluster
    // cannot go first. Everything else cascades from the account or the work order.
    await db.query('DELETE FROM treatment_record WHERE cluster_id = $1', [clusterId]);
    await db.query('DELETE FROM report WHERE reporter_id = $1', [accountId]);
    await db.query('DELETE FROM work_order WHERE cluster_id = $1', [clusterId]);
    await db.query('DELETE FROM cluster WHERE id = $1', [clusterId]);
    await db.query('DELETE FROM account WHERE id = $1', [accountId]);
    await db.close();
  }, 30_000);

  function report(point: GeoPoint, status: ReportStatus, submittedAt = new Date()): Report {
    const r = new Report();
    r.id = randomUUID();
    r.reporterId = accountId;
    r.point = point;
    r.type = ReportType.StandingWater;
    r.description = 'repository test';
    r.clusterId = null;
    r.localityBinding = 'Repository test site';
    r.corroborationCount = 0;
    r.submittedAt = submittedAt;
    r.moderatorId = null;
    r.moderatedAt = null;
    r.moderationReason = null;
    r.workOrderId = null;
    r.applyStatus(status);
    return r;
  }

  function workOrder(scheduledDate: string, status: WorkOrderStatus): WorkOrder {
    const order = new WorkOrder();
    order.id = randomUUID();
    order.clusterId = clusterId;
    order.assigneeId = null;
    order.sourceReportId = null;
    order.taskType = TaskType.Fogging;
    order.scheduledDate = scheduledDate;
    order.priority = PriorityTier.High;
    order.instructions = 'repository test';
    order.startedAt = null;
    order.cancellationReason = null;
    order.issueFlag = false;
    order.issueReason = null;
    order.createdAt = new Date();
    order.applyStatus(status);
    return order;
  }

  it('R1 — a point survives the round trip with latitude and longitude the right way round', async () => {
    const saved = await reports.save(report(ORIGIN, ReportStatus.Submitted));
    const back = await reports.findById(saved.id);

    // GeoJSON is [longitude, latitude]. A swap reads as a plausible coordinate, passes every unit
    // test, and puts a Woodlands report in the middle of the Java Sea.
    expect(back?.point.latitude).toBeCloseTo(ORIGIN.latitude, 6);
    expect(back?.point.longitude).toBeCloseTo(ORIGIN.longitude, 6);
  });

  it('R2 — the private status is rehydrated, not left at its default (5.2.1)', async () => {
    const saved = await reports.save(report(ORIGIN, ReportStatus.Verified));
    const back = await reports.findById(saved.id);

    // `status` is private and only `applyStatus` sets it. A repository that assigned the public
    // fields and stopped would return this as undefined and `isVerified()` false — silently
    // dropping the report out of 4.1.3's driver rather than failing.
    expect(back?.currentStatus()).toBe(ReportStatus.Verified);
    expect(back?.isVerified()).toBe(true);
  });

  it('R3 — 5.1.11 is inclusive at fifty metres and excludes fifty-one', async () => {
    const now = new Date();
    await reports.save(report(new GeoPoint(ORIGIN.latitude + 50 * METRE, ORIGIN.longitude), ReportStatus.Submitted, now));
    await reports.save(report(new GeoPoint(ORIGIN.latitude + 51 * METRE, ORIGIN.longitude), ReportStatus.Submitted, now));

    const nearby = await reports.findNearbyOpen(
      ORIGIN,
      ReportType.StandingWater,
      50,
      new Date(now.getTime() - 24 * 3_600_000),
    );

    // The boundary case is the requirement, not a rounding detail: fifty metres is "within fifty
    // metres". `geography` measures metres on the spheroid; `geometry` would have measured degrees
    // and matched most of Southeast Asia.
    const distances = nearby.map((r) => Math.round((r.point.latitude - ORIGIN.latitude) / METRE));
    expect(distances).toContain(50);
    expect(distances).not.toContain(51);
  });

  it('R4 — a settled report at the same spot is not a duplicate (5.1.11, "an existing OPEN report")', async () => {
    const now = new Date();
    const spot = new GeoPoint(ORIGIN.latitude + 5 * METRE, ORIGIN.longitude);
    await reports.save(report(spot, ReportStatus.Rejected, now));

    const nearby = await reports.findNearbyOpen(spot, ReportType.StandingWater, 10, new Date(now.getTime() - 3_600_000));

    // Rejected and Closed are settled: the site was dealt with, so a report there is a new
    // observation rather than a duplicate of a decision already made.
    expect(nearby.some((r) => r.currentStatus() === ReportStatus.Rejected)).toBe(false);
  });

  it('R5 — a different report type at the same spot is not a duplicate (5.1.11)', async () => {
    const now = new Date();
    const spot = new GeoPoint(ORIGIN.latitude - 5 * METRE, ORIGIN.longitude);
    await reports.save(report(spot, ReportStatus.Submitted, now));

    const nearby = await reports.findNearbyOpen(spot, ReportType.UnclearedRefuse, 10, new Date(now.getTime() - 3_600_000));

    expect(nearby).toHaveLength(0);
  });

  it('R6 — a report older than the window is not a duplicate (5.1.11)', async () => {
    const now = new Date();
    // Half a kilometre away, with its own radius: the earlier cases in this file leave reports
    // within a few metres of ORIGIN, and a window test that quietly matched those would be
    // asserting nothing about the window at all.
    const spot = new GeoPoint(ORIGIN.latitude, ORIGIN.longitude + 500 * METRE);
    await reports.save(report(spot, ReportStatus.Submitted, new Date(now.getTime() - 25 * 3_600_000)));

    const nearby = await reports.findNearbyOpen(spot, ReportType.StandingWater, 10, new Date(now.getTime() - 24 * 3_600_000));

    expect(nearby).toHaveLength(0);
  });

  it('R7 — 5.1.7 containment uses ST_Covers, so a point on the boundary is inside', async () => {
    const onEdge = new GeoPoint(ORIGIN.latitude + 10 * METRE, ORIGIN.longitude);

    const containing = await clusters.findContaining(onEdge);

    // `ST_Contains` would exclude it. A resident standing on the edge of a cluster is in it, and
    // telling them otherwise is the kind of answer that costs trust in the whole map.
    expect(containing?.id).toBe(clusterId);
  });

  it('R8 — a scheduled date is a calendar date and does not shift a day in Singapore (8.1.3)', async () => {
    const saved = await workOrders.save(workOrder('2026-09-04', WorkOrderStatus.Created));

    const back = await workOrders.findById(saved.id);

    // `pg` hands back a `date` as a Date at LOCAL midnight; `toISOString()` on it is 16:00 the
    // previous day in UTC, so the naive conversion reports work scheduled for the third.
    expect(back?.scheduledDate).toBe('2026-09-04');
    expect(back?.currentStatus()).toBe(WorkOrderStatus.Created);
  });

  it('R9 — an untreated cluster is ninety days since treatment; a treated one is measured (4.1.15, 4.1.16)', async () => {
    const now = new Date('2026-09-04T12:00:00+08:00');

    // 4.1.16's default, and deliberately not zero: a cluster nobody has ever treated is the worst
    // case for this driver, and zero would score it as though it had been treated this morning.
    expect(await treatments.daysSinceLastTreatment(clusterId, now)).toBe(90);

    const order = await workOrders.save(workOrder('2026-08-25', WorkOrderStatus.Verified));
    const record = new TreatmentRecord();
    record.id = randomUUID();
    record.clusterId = clusterId;
    record.workOrderId = order.id;
    record.taskType = TaskType.Fogging;
    record.completionDate = '2026-08-25';
    await treatments.save(record);

    expect(await treatments.daysSinceLastTreatment(clusterId, now)).toBe(10);
  });

  it('R10 — the lock-out state survives a restart, as three values that must agree (2.1.10)', async () => {
    const account = await accounts.findById(accountId);
    const firstFailure = new Date('2026-09-04T10:00:00Z');
    const lockedUntil = new Date('2026-09-04T10:15:00Z');
    account?.restoreLockState({ failedAttempts: 5, firstFailureAt: firstFailure, lockedUntil });
    await accounts.save(account as Account);

    const state = (await accounts.findById(accountId))?.lockState();

    // All three or none: a restart that kept the counter but lost the window would lock a user out
    // on their next single mistake, and one that kept `lockedUntil` but lost the counter would let
    // the sixth attempt through.
    expect(state?.failedAttempts).toBe(5);
    expect(state?.firstFailureAt?.getTime()).toBe(firstFailure.getTime());
    expect(state?.lockedUntil?.getTime()).toBe(lockedUntil.getTime());
  });

  it('R11 — touching a session updates it rather than inserting a second row (2.1.9)', async () => {
    const session = new Session();
    session.id = randomUUID();
    session.accountId = accountId;
    session.token = 'tok-' + randomUUID();
    session.issuedAt = new Date('2026-09-04T10:00:00Z');
    session.lastActiveAt = new Date('2026-09-04T10:00:00Z');
    session.terminatedAt = null;
    await sessions.save(session);

    session.lastActiveAt = new Date('2026-09-04T10:20:00Z');
    await sessions.save(session);

    // The upsert keys on the id, not the token. Keying on the token would make every activity
    // extension insert a row, and 2.1.9's inactivity timeout would then be computed over a table
    // that grows with every request the user makes.
    const rows = await db.query('SELECT count(*)::int AS n FROM session WHERE account_id = $1', [accountId]);
    expect(rows[0]?.n).toBe(1);
    expect((await sessions.findByToken(session.token))?.lastActiveAt.toISOString()).toBe('2026-09-04T10:20:00.000Z');
  });
});

/**
 * §2.4.2's guarantee is the database's, and this is where that claim is checked.
 *
 * Every other audit test in the suite runs against `InMemoryAuditStore`, where "cannot be
 * modified" means "the interface has no method for it" — true, and worth nothing against a
 * `psql` prompt. The real guarantee is the `audit_record_no_change` trigger, and a trigger is not
 * a property of the port, so it can only be tested here.
 *
 * **These rows are not cleaned up, deliberately.** `afterAll` cannot delete them: that is the
 * behaviour under test. They carry a unique target id so they are identifiable as test rows, and
 * an audit table that accumulates a handful of them is exactly what an append-only table looks
 * like.
 */
describe.skipIf(!live)('The audit trail against live Postgres — §2.4.1, §2.4.2', () => {
  let db: Database;
  let audit: AuditRepository;
  const targetId = randomUUID();
  const actor = randomUUID();

  beforeAll(async () => {
    db = new Database(url);
    audit = new AuditRepository(db);
  }, 30_000);

  afterAll(async () => {
    // No DELETE here. There cannot be one — see the block comment.
    await db.close();
  }, 30_000);

  it('U1 — a row written through the port comes back through the port', async () => {
    await audit.appendAction(actor, 'workOrder:assign', 'RepositoryTest', targetId);
    const history = await audit.forTarget('RepositoryTest', targetId, 10);

    expect(history).toHaveLength(1);
    expect(history[0]?.accountId).toBe(actor);
    expect(history[0]?.action).toBe('workOrder:assign');
    expect(history[0]?.occurredAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('U2 — a denial is stored distinguishably from a thing that happened (2.3.8)', async () => {
    await audit.appendDenial(actor, 'audit:read', 'RepositoryTest', targetId);
    const history = await audit.forTarget('RepositoryTest', targetId, 10);
    expect(history.some((e) => e.action === 'DENIED:audit:read')).toBe(true);
  });

  it('U3 — a non-uuid actor and a non-uuid target are stored, not silently dropped', async () => {
    // `SYSTEM_ACTOR_ID` is the string 'system' and a photograph is named by a storage key —
    // a uuid *plus an extension*. Both were refused by the original column type, and because
    // `append` swallows failures on purpose, they were refused invisibly. Migration 003 is what
    // this case defends.
    const photoKey = `${randomUUID()}.jpg`;
    await audit.appendAction('system', 'photo:upload', 'RepositoryTestPhoto', photoKey);
    const history = await audit.forTarget('RepositoryTestPhoto', photoKey, 10);

    expect(history).toHaveLength(1);
    expect(history[0]?.accountId).toBe('system');
  });

  it('U4 — Postgres itself refuses an UPDATE and a DELETE (2.4.2)', async () => {
    await expect(
      db.query("UPDATE audit_record SET action = 'tampered' WHERE target_id = $1", [targetId]),
    ).rejects.toThrow(/cannot be update/i);
    // The row proving something happened is the row an attacker most wants gone, so the refusal
    // has to hold against the application's own connection — which owns the schema, so a REVOKE
    // would not bind it. A trigger does.
    await expect(
      db.query('DELETE FROM audit_record WHERE target_id = $1', [targetId]),
    ).rejects.toThrow(/cannot be delete/i);

    expect((await audit.forTarget('RepositoryTest', targetId, 10)).length).toBeGreaterThan(0);
  });

  it('U5 — the trail is newest first, and ties break in insertion order', async () => {
    const burst = randomUUID();
    for (const action of ['first', 'second', 'third']) {
      await audit.appendAction(actor, action, 'RepositoryTestOrder', burst);
    }
    const history = await audit.forTarget('RepositoryTestOrder', burst, 10);
    // Two rows written in the same millisecond share `occurred_at`; ordering by time alone leaves
    // their relative order to the planner, which is how a trail comes back scrambled.
    expect(history.map((e) => e.action)).toEqual(['third', 'second', 'first']);
  });
});

/**
 * §3's data, which is the data a restart hurt most (3.1.1, 3.1.11, 3.1.12, 6.1.1).
 *
 * Three properties here belong to Postgres rather than to the port, and each has a specific way of
 * being wrong that no in-memory double can reproduce:
 *
 *  1. `ST_MakePoint` takes (longitude, latitude) and the entity is (latitude, longitude). A swap
 *     survives every unit test and puts a Bishan address in the Java Sea.
 *  2. `numeric` columns come back from `pg` as **strings**. Left uncoerced, `caseSize` renders as
 *     "12" and a distance comparison compares text.
 *  3. `alert_subscription` is UNIQUE on `saved_location_id`, so an upsert keyed on `id` — the
 *     obvious thing to write — violates the constraint the second time a resident changes their
 *     alert settings.
 */
describe.skipIf(!live)('Saved locations and subscriptions against live PostGIS — §3.1.x, §6.1.x', () => {
  let db: Database;
  let locations: SavedLocationRepository;
  let subscriptions: AlertSubscriptionRepository;
  let accounts: AccountRepository;
  const accountId = randomUUID();
  /** Bishan, and deliberately not symmetrical: a latitude/longitude swap must be visible. */
  const HOME = new GeoPoint(1.3521, 103.8198);

  beforeAll(async () => {
    db = new Database(url);
    locations = new SavedLocationRepository(db);
    subscriptions = new AlertSubscriptionRepository(db);
    accounts = new AccountRepository(db);

    const account = new Account();
    account.id = accountId;
    account.email = 'loc-test-' + accountId.slice(0, 8) + '@d-fence.test';
    account.authUserId = 'auth-' + accountId;
    account.emailVerified = true;
    account.role = Role.Resident;
    account.isActive = true;
    account.telegramChatId = null;
    account.createdAt = new Date();
    await accounts.save(account);
  }, 30_000);

  afterAll(async () => {
    if (db === undefined) {
      return;
    }
    // `saved_location` and `alert_subscription` both cascade from the account.
    await db.query('DELETE FROM account WHERE id = $1', [accountId]);
    await db.close();
  }, 30_000);

  function location(name: string, evaluated: boolean): SavedLocation {
    const l = new SavedLocation();
    l.id = randomUUID();
    l.accountId = accountId;
    l.inputText = '123456';
    l.resolvedAddress = 'BLK 1 TEST STREET SINGAPORE 123456';
    l.point = HOME;
    l.label = LocationLabel.Home;
    l.name = name;
    l.exposureStatus = evaluated ? ExposureStatus.WITHIN_150M : ExposureStatus.CLEAR;
    l.exposure = evaluated
      ? {
          clusterId: null,
          clusterLocality: 'Test Cluster Rd',
          caseSize: 12,
          distanceMetres: 87.5,
          dataTimestamp: new Date('2026-09-05T00:00:00Z'),
        }
      : { clusterId: null, clusterLocality: null, caseSize: null, distanceMetres: null, dataTimestamp: null };
    l.rain24hMm = evaluated ? 4.5 : null;
    l.rain72hMm = evaluated ? 18.25 : null;
    l.evaluatedAt = evaluated ? new Date('2026-09-05T01:00:00Z') : null;
    return l;
  }

  it('L1 — a saved location round-trips, and the point is not transposed', async () => {
    const saved = await locations.save(location('Home', true));
    const read = await locations.findById(saved.id);

    expect(read).not.toBeNull();
    // Six decimal places is about 11 cm; anything less would let a swap of 1.35/103.82 hide.
    expect(read?.point.latitude).toBeCloseTo(HOME.latitude, 6);
    expect(read?.point.longitude).toBeCloseTo(HOME.longitude, 6);
    expect(read?.resolvedAddress).toBe('BLK 1 TEST STREET SINGAPORE 123456');
  });

  it('L2 — the exposure evaluation is stored, as numbers rather than as numeric strings', async () => {
    const saved = await locations.save(location('School', true));
    const read = await locations.findById(saved.id);

    expect(read?.exposureStatus).toBe(ExposureStatus.WITHIN_150M);
    expect(read?.exposure.caseSize).toBe(12);
    expect(read?.exposure.distanceMetres).toBe(87.5);
    // `numeric(7,1)` — a tenth of a millimetre, so 18.25 comes back as 18.3. Asserted rather than
    // avoided: the rounding is the column's, it is invisible in every in-memory test, and a future
    // reader comparing a stored total against a freshly computed one needs to know it happens.
    expect(read?.rain72hMm).toBe(18.3);
    // 3.1.10 shows the *feed's* timestamp, not the evaluation time, so both are stored.
    expect(read?.exposure.dataTimestamp?.toISOString()).toBe('2026-09-05T00:00:00.000Z');
    expect(read?.evaluatedAt?.toISOString()).toBe('2026-09-05T01:00:00.000Z');
    // And 3.1.8's exposure check must be able to compare, not concatenate.
    expect(typeof read?.exposure.distanceMetres).toBe('number');
  });

  it('L3 — an unevaluated location has a null evaluation, not a fresh-looking one', async () => {
    const saved = await locations.save(location('Workplace', false));
    const read = await locations.findById(saved.id);
    // A default of now() would say "checked just now and found clear" about a location nothing has
    // ever looked at — the one wrong answer worth ruling out.
    expect(read?.evaluatedAt).toBeNull();
    expect(read?.exposure.caseSize).toBeNull();
  });

  it('L4 — a resident sees their own locations, in a stable order (2.3.1, 3.1.11)', async () => {
    const mine = await locations.findForAccount(accountId);
    expect(mine.length).toBeGreaterThanOrEqual(3);
    expect(mine.every((l) => l.accountId === accountId)).toBe(true);
    // 3.1.11's five-location limit is counted from this list, so an unstable one would make the
    // limit depend on the order rows happened to come back in.
    const second = await locations.findForAccount(accountId);
    expect(second.map((l) => l.id)).toEqual(mine.map((l) => l.id));
  });

  it('L5 — a subscription is keyed by location, so changing it twice does not insert twice', async () => {
    const saved = await locations.save(location('Alerts', false));
    const first = await subscriptions.save(AlertSubscription.create(saved.id, accountId));
    const again = AlertSubscription.create(saved.id, accountId);
    again.enabled = true;
    again.growthThreshold = 9;
    again.triggers = [AlertTrigger.ClusterGrowth];
    const second = await subscriptions.save(again);

    // 6.1.1 is a switch *per location*, and the table says UNIQUE (saved_location_id): an upsert
    // keyed on the entity's own id would violate it the second time a resident changed a setting.
    expect(second.id).toBe(first.id);
    const read = await subscriptions.findForLocation(saved.id);
    expect(read?.enabled).toBe(true);
    expect(read?.growthThreshold).toBe(9);
    expect(read?.triggers).toEqual([AlertTrigger.ClusterGrowth]);
  });

  it('L6 — deleting a location takes its subscription with it (3.1.12)', async () => {
    const saved = await locations.save(location('Doomed', false));
    await subscriptions.save(AlertSubscription.create(saved.id, accountId));

    const removed = await subscriptions.deleteForLocation(saved.id);
    // The count is what the confirmation message states, so it is returned rather than inferred.
    expect(removed).toBe(1);
    await locations.delete(saved.id);
    expect(await locations.findById(saved.id)).toBeNull();
    expect(await subscriptions.findForLocation(saved.id)).toBeNull();
  });

  it('L7 — the cascade holds even when only the location is deleted', async () => {
    const saved = await locations.save(location('Cascade', false));
    await subscriptions.save(AlertSubscription.create(saved.id, accountId));

    // The controller deletes the subscription first because it must report the count and because
    // the in-memory store has no cascade. This asserts the database guarantee underneath it, which
    // is what protects a subscription orphaned by any other path.
    await locations.delete(saved.id);
    expect(await subscriptions.findForLocation(saved.id)).toBeNull();
  });

  it('L8 — every location is readable for the 3.1.8 re-evaluation sweep', async () => {
    const all = await locations.all();
    expect(all.some((l) => l.accountId === accountId)).toBe(true);
  });
});

/**
 * The development auth provider's secrets, against live Postgres (§2.1.4, §2.1.5, §2.1.7, §2.1.11).
 *
 * `LocalAuthProvider` held these in three Maps while the `account` row was already in the database,
 * so a restart left every account present — with a role, in the staff list — and nobody able to
 * sign in to it. The provider's *rules* are tested against the in-memory store in
 * `tests/account.test.ts`; what can only be tested here is the storage those rules stand on.
 *
 * The case that would otherwise bite silently is C2: `bytea` must come back as the same bytes. A
 * hash round-tripped through a string under the wrong encoding compares unequal to itself, and the
 * symptom — "the password I just set does not work" — points at the hashing rather than at the
 * storage.
 */
describe.skipIf(!live)('Local credentials against live Postgres — §2.1.x, §10.3.1', () => {
  let db: Database;
  let store: CredentialRepository;
  let provider: LocalAuthProvider;
  const email = 'cred-test-' + randomUUID().slice(0, 8) + '@d-fence.test';

  beforeAll(async () => {
    db = new Database(url);
    store = new CredentialRepository(db);
    provider = new LocalAuthProvider(store);
  }, 30_000);

  afterAll(async () => {
    if (db === undefined) {
      return;
    }
    await db.query('DELETE FROM local_credential WHERE email LIKE $1', ['cred-test-%@d-fence.test']);
    await db.close();
  }, 30_000);

  it('C1 — a registered credential authenticates after being read back from the database', async () => {
    const authUserId = await provider.register({ email, password: 'CorrectHorse2026' });
    // A fresh provider over the same table is exactly what a restart produces.
    const afterRestart = new LocalAuthProvider(new CredentialRepository(db));
    const session = await afterRestart.signIn({ email, password: 'CorrectHorse2026' });

    expect(session.authUserId).toBe(authUserId);
    await expect(afterRestart.signIn({ email, password: 'wrong' })).rejects.toThrow();
  });

  it('C2 — the salt and the hash return as the same bytes, with no encoding round trip', async () => {
    const record = await store.findByEmail(email);
    expect(Buffer.isBuffer(record?.salt)).toBe(true);
    expect(Buffer.isBuffer(record?.hash)).toBe(true);
    // scrypt with a 16-byte salt and a 64-byte key length, which is what the provider asks for.
    expect(record?.salt.length).toBe(16);
    expect(record?.hash.length).toBe(64);
    // And no plaintext anywhere near the row.
    expect(JSON.stringify(record)).not.toContain('CorrectHorse2026');
  });

  it('C3 — the same address cannot be registered twice (2.1.4)', async () => {
    await expect(provider.createUser({ email, password: 'Another2026Pass' })).rejects.toThrow();
    // And the original password still works: a refused duplicate must not have touched it.
    await expect(provider.signIn({ email, password: 'CorrectHorse2026' })).resolves.toBeTruthy();
  });

  it('C4 — a verification token is single use (2.1.5)', async () => {
    const second = 'cred-test-' + randomUUID().slice(0, 8) + '@d-fence.test';
    const authUserId = await provider.register({ email: second, password: 'VerifyMe2026' });
    const token = (await provider.verificationTokenFor(authUserId)) as string;
    expect(token).toBeTruthy();

    expect(await provider.consumeVerification(token)).toBe(authUserId);
    // The read is the delete, so two requests carrying the same link cannot both succeed.
    expect(await provider.consumeVerification(token)).toBeNull();
  });

  it('C5 — a reset changes the password once, and the spent token stays refused (2.1.11)', async () => {
    await provider.requestPasswordReset(email);
    const token = (await provider.latestResetToken()) as string;
    await provider.completePasswordReset(token, 'RotatedPass2026');

    await expect(provider.signIn({ email, password: 'RotatedPass2026' })).resolves.toBeTruthy();
    await expect(provider.signIn({ email, password: 'CorrectHorse2026' })).rejects.toThrow();
    // Spent, not deleted: "already used" must stay distinguishable from "never existed", or a user
    // clicking an old link twice gets the same answer as someone guessing tokens.
    await expect(provider.completePasswordReset(token, 'ThirdPassword26')).rejects.toThrow();
  });

  it('C6 — an expired reset token is refused (2.1.11)', async () => {
    const record = await store.findByEmail(email);
    const expired = 'expired-' + randomUUID();
    await store.putReset(expired, (record as { authUserId: string }).authUserId, new Date(Date.now() - 1000));
    await expect(provider.completePasswordReset(expired, 'TooLatePass26')).rejects.toThrow();
  });

  it('C7 — a deactivated credential does not authenticate, and reactivation restores it (2.2.5)', async () => {
    const record = (await store.findByEmail(email)) as { authUserId: string };
    await provider.disableUser(record.authUserId);
    await expect(provider.signIn({ email, password: 'RotatedPass2026' })).rejects.toThrow();

    await provider.enableUser(record.authUserId);
    await expect(provider.signIn({ email, password: 'RotatedPass2026' })).resolves.toBeTruthy();
  });

  it('C8 — seeding is idempotent, which is what a restart needs (2.1.4)', async () => {
    const seedEmail = 'cred-test-' + randomUUID().slice(0, 8) + '@d-fence.test';
    const first = await provider.ensureUser({ email: seedEmail, password: 'SeedPass2026aa' });
    // The second boot. `createUser` would raise 2.1.4's duplicate here and abort start-up.
    const second = await provider.ensureUser({ email: seedEmail, password: 'SeedPass2026bb' });

    expect(second).toBe(first);
    // And the configured password wins, so changing the environment variable and restarting is a
    // working rotation — the only one an operator has without a mail server.
    await expect(provider.signIn({ email: seedEmail, password: 'SeedPass2026bb' })).resolves.toBeTruthy();
    await expect(provider.signIn({ email: seedEmail, password: 'SeedPass2026aa' })).rejects.toThrow();
  });

  it('C9 — deleting a credential takes its tokens with it (10.4.3)', async () => {
    const doomed = 'cred-test-' + randomUUID().slice(0, 8) + '@d-fence.test';
    const authUserId = await provider.register({ email: doomed, password: 'DeleteMe2026x' });
    const token = (await provider.verificationTokenFor(authUserId)) as string;

    await provider.deleteUser(authUserId);
    expect(await store.findById(authUserId)).toBeNull();
    // The cascade, not a second DELETE in the application: an orphaned token is a live link to an
    // account that no longer exists.
    expect(await provider.consumeVerification(token)).toBeNull();
  });
});

/**
 * §2.42 — the rainfall aggregation, against live Postgres.
 *
 * This block exists for one reason: `RainfallRepository.stationWindows` replaced reading every row
 * in the 72-hour window with a `GROUP BY`, and the reason it had to is that the old shape was
 * moving ~3.2 MB out of Supabase every five minutes — 13.31 GB against a 5.5 GB allowance, three
 * days from the project being cut off.
 *
 * An in-memory test cannot check this. `rainfall.test.ts` Q1–Q6 prove the *design* agrees with
 * `accumulate`; what is left is whether the SQL does, and the traps are all SQL's own: `sum()` over
 * no rows is NULL rather than 0, `numeric` comes back as a string and would concatenate rather than
 * add, and a `FILTER` clause with the wrong bound silently sums the wrong window. Every one of those
 * yields a plausible number, not an error.
 */
describe.skipIf(!live)('The rainfall aggregation against live Postgres — §1.2.7, §1.2.8', () => {
  let db: Database;
  let rainfall: RainfallRepository;
  const accumulator = new RainfallAccumulator();
  /** Well away from any real station, and prefixed so a stray row is obvious in the table. */
  const ids = ['ZZTEST-A', 'ZZTEST-B', 'ZZTEST-C'];
  const NOW = new Date('2026-09-17T04:00:00Z');
  const stations: ParsedStation[] = [
    { stationId: ids[0] as string, name: 'test A', point: new GeoPoint(1.2, 103.6) },
    { stationId: ids[1] as string, name: 'test B', point: new GeoPoint(1.21, 103.6) },
    { stationId: ids[2] as string, name: 'test C', point: new GeoPoint(1.22, 103.6) },
  ];

  function reading(stationId: string, minutesAgo: number, valueMm: number): ParsedReading {
    return { stationId, readingAt: new Date(NOW.getTime() - minutesAgo * 60_000), valueMm };
  }

  beforeAll(async () => {
    db = new Database(url);
    rainfall = new RainfallRepository(db);
    await rainfall.saveStations(stations);
    await rainfall.saveReadings([
      // Inside the 5-minute window, and therefore inside all three.
      reading(ids[0] as string, 3, 1.5),
      reading(ids[1] as string, 3, 0.5),
      reading(ids[2] as string, 3, 0),
      // Inside 24 hours, outside 5 minutes.
      reading(ids[0] as string, 60 * 6, 2.25),
      reading(ids[1] as string, 60 * 6, 4),
      // Inside 72 hours, outside 24.
      reading(ids[0] as string, 60 * 40, 8),
      reading(ids[2] as string, 60 * 40, 3),
      // Outside 72 hours entirely — must not be counted anywhere.
      reading(ids[0] as string, 60 * 90, 999),
      // In the future. The feed has published these; a total for a period that has not happened yet
      // is not a total.
      reading(ids[0] as string, -60, 777),
    ]);
  });

  afterAll(async () => {
    await db.query(`DELETE FROM rainfall_reading WHERE station_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM rainfall_station WHERE station_id = ANY($1)`, [ids]);
    await db.close?.();
  });

  it('RA1 — the sums match the readings they were computed from, window by window', async () => {
    const windows = await rainfall.stationWindows(NOW);
    const a = windows.find((w) => w.stationId === ids[0]);

    // 1.5 + 2.25 = 3.75 in 24 hours; + 8 = 11.75 in 72. Neither 999 nor 777 appears in either,
    // which is the whole of the bounds check.
    expect(a?.total24hMm).toBeCloseTo(3.75, 2);
    expect(a?.total72hMm).toBeCloseTo(11.75, 2);
    expect(a?.currentMm).toBeCloseTo(1.5, 2);
    // A number, not a string. `numeric` arrives from pg as a string and `+` would concatenate:
    // "1.5" + "2.25" is "1.52.25", and a 72-hour accumulation becomes nonsense that still renders.
    expect(typeof a?.total72hMm).toBe('number');
  });

  it('RA2 — a station with nothing in a window reports null for it, never 0 (4.1.12)', async () => {
    const windows = await rainfall.stationWindows(NOW);
    const c = windows.find((w) => w.stationId === ids[2]);

    // Station C reported 0 mm three minutes ago and 3 mm forty hours ago, and nothing in between.
    expect(c?.total24hMm).toBeCloseTo(0, 5); // it *did* report — 0 mm is a measurement
    expect(c?.total72hMm).toBeCloseTo(3, 2);

    const b = windows.find((w) => w.stationId === ids[1]);
    expect(b?.total24hMm).toBeCloseTo(4.5, 2);
    // Every station here reported inside 72 hours, so the null case is exercised by asking for a
    // window none of them reached: `sum()` over no rows is NULL, and a mapping that wrote 0 would
    // assert "no rain" where the truth is "no data".
    const future = await rainfall.stationWindows(new Date(NOW.getTime() + 100 * 3_600_000));
    expect(future.filter((w) => ids.includes(w.stationId))).toHaveLength(0);
  });

  it('RA3 — the aggregate and the row-by-row accumulation give the same cluster rainfall', async () => {
    const centroid = new GeoPoint(1.2, 103.6);
    const readings = (await rainfall.readingsSince(new Date(NOW.getTime() - 72 * 3_600_000))).filter(
      (r) => ids.includes(r.stationId) && r.readingAt <= NOW,
    );
    const windows = (await rainfall.stationWindows(NOW)).filter((w) => ids.includes(w.stationId));

    const direct = accumulator.accumulate(centroid, stations, readings, NOW);
    const summed = accumulator.accumulateWindows(centroid, stations, windows, NOW);

    // The assertion the change stands on. Everything else in this file is about a repository being
    // faithful to an entity; this is about a repository being faithful to an arithmetic.
    expect(summed.accum24hMm).toBeCloseTo(direct.accum24hMm, 5);
    expect(summed.accum72hMm).toBeCloseTo(direct.accum72hMm, 5);
    expect(summed.currentMm).toBeCloseTo(direct.currentMm, 5);
    expect(summed.observed24hHours).toBeCloseTo(direct.observed24hHours, 3);
    expect(summed.observed72hHours).toBeCloseTo(direct.observed72hHours, 3);
  });

  it('RA4 — one row per station, whatever the number of readings', async () => {
    const readings = await rainfall.readingsSince(new Date(NOW.getTime() - 72 * 3_600_000));
    const windows = await rainfall.stationWindows(NOW);

    // On the live table this is the difference between 66,866 rows and 88. Asserted as a ratio
    // rather than a constant, because the live table keeps filling.
    expect(windows.length).toBeLessThan(readings.length);
    expect(new Set(windows.map((w) => w.stationId)).size).toBe(windows.length);
  });
});

/**
 * §2.43 — the priority score table, against live Postgres.
 *
 * **This block exists because its absence took the live system down for ten hours.** Migration 005
 * replaced the unique key on `priority_score` — `(cluster_id, computed_at)` became
 * `(cluster_id, pest_type, computed_at)`, because a locality now has one score per pest and the old
 * key would have let the second pest scored in a cycle silently fail to insert. The migration was
 * written and applied. `PriorityScoreRepository`, which names that key in an `ON CONFLICT` clause,
 * was not touched.
 *
 * From 2026-09-16 16:05Z every scoring cycle on the deployed instance raised "no unique or
 * exclusion constraint matching the ON CONFLICT specification", rolled back its transaction, and
 * wrote nothing. Ingestion carried on succeeding, the health endpoint stayed green, and the
 * dashboard went on serving the last scores it had, which is why nothing looked wrong. The suite
 * could not have caught it: `PriorityScoreRepository` had no live-database test at all, and the
 * in-memory store has no constraints to violate.
 */
describe.skipIf(!live)('The priority score table against live Postgres — §4.1.11, §4.2.1', () => {
  let db: Database;
  let scores: PriorityScoreRepository;
  const clusterId = randomUUID();
  const computedAt = new Date('2026-09-17T03:00:00Z');

  function score(pestType: PestType, value: number, rank: number): PriorityScore {
    const s = new PriorityScore();
    s.clusterId = clusterId;
    s.localityId = clusterId;
    s.pestType = pestType;
    s.computedAt = computedAt;
    s.score = value;
    s.tier = PriorityTier.Medium;
    s.isDegraded = false;
    s.excludedDrivers = [];
    s.rank = rank;
    s.contributions = [];
    return s;
  }

  beforeAll(async () => {
    db = new Database(url);
    scores = new PriorityScoreRepository(db);
    const ring = [[103.6, 1.2], [103.61, 1.2], [103.61, 1.21], [103.6, 1.21], [103.6, 1.2]]
      .map((p) => p.join(' '))
      .join(',');
    await db.query(
      'INSERT INTO cluster (id, object_id, locality, boundary, case_size, change_class, trajectory, is_active) ' +
        "VALUES ($1, $2, 'Score Test Locality', ST_GeogFromText($3), 5, 'UNCHANGED', 'Stable', true)",
      [clusterId, 'score-test-' + clusterId.slice(0, 8), 'POLYGON((' + ring + '))'],
    );
  });

  afterAll(async () => {
    await db.query(
      'DELETE FROM driver_contribution WHERE priority_score_id IN (SELECT id FROM priority_score WHERE cluster_id = $1)',
      [clusterId],
    );
    await db.query('DELETE FROM priority_score WHERE cluster_id = $1', [clusterId]);
    await db.query('DELETE FROM cluster WHERE id = $1', [clusterId]);
    await db.close?.();
  });

  it('PS1 — a cycle of scores saves at all, which is the regression this block is named for', async () => {
    // The whole of the outage, as one assertion. Against the real constraint this either writes or
    // throws; there is no in-memory equivalent of "the ON CONFLICT target does not exist".
    await expect(scores.saveAll([score(PestType.Mosquito, 71.2, 1)])).resolves.toBeUndefined();

    const stored = await scores.historyFor(clusterId, 10);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.score).toBeCloseTo(71.2, 1);
  });

  it('PS2 — two pests in one locality in one cycle both survive (4.2.1)', async () => {
    await scores.saveAll([
      score(PestType.Mosquito, 71.2, 1),
      score(PestType.Rat, 44.8, 2),
      score(PestType.Snake, 12.0, 3),
    ]);

    const stored = await scores.historyFor(clusterId, 10);
    const byPest = new Map(stored.map((s) => [s.pestType, s.score]));

    // Before the fix the repository wrote no pest_type, so all three took the column default and
    // collided on the conflict target: the last one written would have been the only survivor, and
    // the queue would have shown one row where there are three subjects.
    expect(stored).toHaveLength(3);
    expect(byPest.get(PestType.Mosquito)).toBeCloseTo(71.2, 1);
    expect(byPest.get(PestType.Rat)).toBeCloseTo(44.8, 1);
    expect(byPest.get(PestType.Snake)).toBeCloseTo(12.0, 1);
  });

  it('PS3 — rescoring the same subject updates it rather than duplicating or failing', async () => {
    await scores.saveAll([score(PestType.Rat, 44.8, 2)]);
    const again = score(PestType.Rat, 51.3, 1);
    await scores.saveAll([again]);

    const rats = (await scores.historyFor(clusterId, 20)).filter((s) => s.pestType === PestType.Rat);

    // One row, updated. 4.1.11 keeps history across *cycles*, and two rows for one cycle would be
    // a ranking with the same subject in it twice.
    expect(rats).toHaveLength(1);
    expect(rats[0]?.score).toBeCloseTo(51.3, 1);
    expect(rats[0]?.rank).toBe(1);
  });
});
