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
