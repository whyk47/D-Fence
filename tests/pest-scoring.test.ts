/**
 * D-Fence — the cross-pest generalisation, everything except 4.2.5.
 *
 * Design: lab4/TEST-PLAN.md §6.2 to §6.4. Case ids here match those tables — O for the critical
 * override (§4.4), T for the evidence tiers (§4.3), F for referral (§8.6). 4.2.5 itself lives in
 * `tests/pest-compatibility.test.ts`, which is written first and read first.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { AccessControlService } from '../src/control/AccessControlService';
import { AccessPolicy } from '../src/control/AccessPolicy';
import { ConfigLoader } from '../src/config/ConfigLoader';
import { ConfigSet } from '../src/config/ConfigSet';
import { NormalisationFactory } from '../src/control/normalisation/NormalisationFactory';
import { UrgencyCalculator } from '../src/control/scoring/UrgencyCalculator';
import { PestPriorityCalculator, ScoredSubject } from '../src/control/scoring/PestPriorityCalculator';
import { CriticalOverrideEvaluator } from '../src/control/scoring/CriticalOverrideEvaluator';
import { PriorityRanking } from '../src/control/PriorityRanking';
import { ReferralController, ReferralRefused } from '../src/control/ReferralController';
import { ReportLifecycleController } from '../src/control/ReportLifecycleController';
import { ReportTransitionTable } from '../src/control/ReportTransitionTable';
import { DispatchController } from '../src/control/DispatchController';
import { WorkOrderLifecycleController } from '../src/control/WorkOrderLifecycleController';
import { WorkOrderTransitionTable } from '../src/control/WorkOrderTransitionTable';
import { InMemoryReportStore, InMemoryClusterLocator } from '../src/persistence/memory/InMemoryReportStores';
import { InMemoryReferralStore } from '../src/persistence/memory/InMemoryReferralStore';
import {
  InMemoryAuditStore,
  InMemoryClusterStore,
  InMemoryPriorityScoreStore,
} from '../src/persistence/memory/InMemoryStores';
import {
  InMemoryTreatmentRecordStore,
  InMemoryWorkOrderStore,
  RecordingNotifier,
} from '../src/persistence/memory/InMemoryWorkOrderStores';
import { Report } from '../src/entity/Report';
import { Cluster } from '../src/entity/Cluster';
import { Principal } from '../src/control/Principal';
import { principalFor } from '../src/control/DashboardController';
import { GeoPoint, Polygon, PremisesMix } from '../src/entity/valueTypes';
import {
  ChangeClass, Driver, EvidenceTier, ForecastRegion, LocationContext, PestType, PriorityTier,
  ReportStatus, ReportType, Role, TaskType, Trajectory,
} from '../src/entity/enums';

const MANAGER = principalFor(Role.OperationsManager, 'manager-1');
const RESIDENT = new Principal('resident-1', Role.Resident, 'session-r1');
const NOW = new Date('2026-09-16T00:00:00Z');
const AT = new GeoPoint(1.43, 103.79);

function config(): ConfigSet {
  return ConfigLoader.load();
}

function calculator(c = config()): PestPriorityCalculator {
  return new PestPriorityCalculator(
    new UrgencyCalculator(NormalisationFactory.build(c.normalisation)),
    c.tierThresholds,
  );
}

const ctx = { observedMin: 0, observedMax: 100, now: NOW };

function subject(pestType: PestType, locality = 'Bedok North Avenue 3'): ScoredSubject {
  return { localityId: `loc-${pestType}`, locality, pestType };
}

/** A report in whatever state the case needs. Built directly: the lifecycle is tested elsewhere. */
function report(
  over: Partial<Report> & { pestType: PestType; status?: ReportStatus },
): Report {
  const r = new Report();
  Object.assign(r, {
    id: `report-${Math.random().toString(36).slice(2)}`,
    reporterId: RESIDENT.accountId,
    point: AT,
    type: ReportType.Other,
    description: 'x',
    clusterId: null,
    localityBinding: 'Bedok North Avenue 3',
    corroborationCount: 0,
    submittedAt: NOW,
    moderatorId: null,
    moderatedAt: null,
    moderationReason: null,
    workOrderId: null,
    locationContext: null,
    injuryReported: false,
  });
  Object.assign(r, over);
  r.applyStatus(over.status ?? ReportStatus.Verified);
  return r;
}

// ---------------------------------------------------------------- §6.3 evidence tiers (4.3)

describe('T: evidence tiers decide the driver set (4.3.4-4.3.10)', () => {
  const c = config();

  it('T1 — tier B names the six drivers of 4.3.5', () => {
    expect(c.pestProfile(PestType.Snake).evidenceTier).toBe(EvidenceTier.B);
    expect(c.pestProfile(PestType.Snake).drivers()).toEqual([
      Driver.VerifiedOpenReportCount,
      Driver.ReportVelocity,
      Driver.ExternalObservationDensity,
      Driver.DaysSinceLastTreatment,
      Driver.CorroborationDensity,
      Driver.ResponseCapacityDeficit,
    ]);
  });

  it('T2 — tier C names the five drivers of 4.3.6, and no external one', () => {
    const bedBug = c.pestProfile(PestType.BedBug);
    expect(bedBug.evidenceTier).toBe(EvidenceTier.C);
    expect(bedBug.drivers()).toHaveLength(5);
    expect(bedBug.drivers()).not.toContain(Driver.ExternalObservationDensity);
    expect(bedBug.drivers()).not.toContain(Driver.CaseSize);
  });

  it('T3 — a weight set naming a driver its tier does not permit is refused (4.3.8)', () => {
    const bad = config();
    const bedBug = bad.pestProfile(PestType.BedBug);
    (bedBug.driverWeights as Map<Driver, number>).set(Driver.Rainfall72h, 0);
    expect(() => bad.validatePestProfiles()).toThrow(/4\.3\.8/);
  });

  it('T4 — a weight set that does not sum to 1.0 is refused (4.3.7)', () => {
    const bad = config();
    const snake = bad.pestProfile(PestType.Snake);
    (snake.driverWeights as Map<Driver, number>).set(Driver.ReportVelocity, 0.9);
    expect(() => bad.validatePestProfiles()).toThrow(/sum to 1\.0/);
  });

  /**
   * T5 is the point of the whole tier scheme. Bed bugs and fleas returned ONE iNaturalist record
   * each in twelve months when the feed was screened on 2026-09-16 — indoor pests are invisible to
   * a biodiversity platform. 4.3.10 says a tier C pest scores anyway, from stored reports alone.
   */
  it('T5 — a tier C pest scores with every external source unreachable (4.3.10)', () => {
    const score = calculator().score(
      subject(PestType.BedBug),
      c.pestProfile(PestType.BedBug),
      // Exactly what a tier C pest has: our own reports, corroborations and treatment recency.
      { verifiedOpenReports: 3, reportVelocity: 2, daysSinceLastTreatment: 40, corroborationDensity: 1 },
      ctx,
    );
    expect(score.score).toBeGreaterThan(0);
    expect(score.evidenceTier).toBe(EvidenceTier.C);
    // One driver absent, and it is ResponseCapacityDeficit — not four v0.9 drivers, and not CaseSize.
    expect(score.excludedDrivers).toEqual([Driver.ResponseCapacityDeficit]);
  });

  it('T6 — severity scales the score, so the same urgency ranks differently per pest (4.2.4)', () => {
    const inputs = { verifiedOpenReports: 5, reportVelocity: 5, daysSinceLastTreatment: 60, corroborationDensity: 3, responseCapacityDeficit: 2000 };
    const rat = calculator().score(subject(PestType.Rat), c.pestProfile(PestType.Rat), inputs, ctx);
    const pangolin = calculator().score(
      subject(PestType.Pangolin), c.pestProfile(PestType.Pangolin), inputs, ctx,
    );
    // Identical urgency, four times the severity: sigma(Rat) 1.00 against sigma(Pangolin) 0.25.
    expect(rat.urgency).toBeCloseTo(pangolin.urgency, 10);
    expect(rat.severityMultiplier / pangolin.severityMultiplier).toBe(4);
    // Compared against the unrounded product, not against four times a rounded score: 4.2.4 rounds
    // each score to one decimal place independently, so 4 x 15.9 is 63.6 and the rat's own score is
    // 63.4. Asserting the first would be asserting that rounding does not happen.
    expect(rat.score).toBe(Math.round(rat.severityMultiplier * rat.urgency * 1000) / 10);
    expect(rat.score).toBeGreaterThan(pangolin.score * 3.9);
  });
});

// ---------------------------------------------------------------- §6.2 critical override (4.4)

describe('O: the critical override (4.4.1-4.4.9)', () => {
  const c = config();
  const evaluator = (): CriticalOverrideEvaluator =>
    new CriticalOverrideEvaluator(c.criticalOverrideRules);
  const snakeProfile = c.pestProfile(PestType.Snake);
  const antProfile = c.pestProfile(PestType.Ant);

  it('O1 — a verified wildlife report indoors is Critical, and names its rule (4.4.7, 4.4.6)', () => {
    const outcome = evaluator().evaluate(
      [report({ pestType: PestType.Snake, locationContext: LocationContext.Indoor })],
      snakeProfile,
    );
    expect(outcome.ruleNames).toContain('wildlife-indoors');
  });

  it('O2 — the same report outdoors takes the tier its score earns', () => {
    const outcome = evaluator().evaluate(
      [report({ pestType: PestType.Snake, locationContext: LocationContext.Outdoor })],
      snakeProfile,
    );
    expect(outcome.ruleNames).toEqual([]);
  });

  it('O3 — an injury raises any pest, wildlife or not (4.4.8)', () => {
    const outcome = evaluator().evaluate(
      [report({ pestType: PestType.Ant, injuryReported: true })],
      antProfile,
    );
    expect(outcome.ruleNames).toEqual(['injury']);
  });

  it('O4 — an ordinary verified report triggers nothing', () => {
    expect(evaluator().evaluate([report({ pestType: PestType.Ant })], antProfile).ruleNames).toEqual([]);
  });

  /**
   * O5. 4.4.1 says **verified**. A Critical tier that anyone could trigger by filing a report is a
   * denial of service against the one thing the override is protecting: the manager's attention.
   */
  it('O5 — an unverified report is not evaluated at all (4.4.1)', () => {
    const outcome = evaluator().evaluate(
      [report({
        pestType: PestType.Snake,
        locationContext: LocationContext.Indoor,
        status: ReportStatus.Submitted,
      } as Partial<Report> & { pestType: PestType })],
      snakeProfile,
    );
    expect(outcome.ruleNames).toEqual([]);
  });

  /**
   * O6 is the case that carries the requirement. An implementation that raises the SCORE to 100
   * instead of raising the TIER passes O1, O3 and O7 and fails only here — and it would have
   * destroyed the only honest thing about the override, which is that it says the case is dangerous
   * without pretending the evidence is stronger than it is.
   */
  it('O6 — the computed score is retained, not inflated (4.4.5)', () => {
    const score = calculator().score(
      subject(PestType.Snake),
      snakeProfile,
      { verifiedOpenReports: 1, reportVelocity: 1, daysSinceLastTreatment: 0, corroborationDensity: 0, externalObservationDensity: 0, responseCapacityDeficit: 0 },
      ctx,
    );
    const before = score.score;
    expect(before).toBeLessThan(40);

    const raised = calculator().withOverride(score, { ruleNames: ['wildlife-indoors'] });
    expect(raised.tier).toBe(PriorityTier.Critical);
    expect(raised.score).toBe(before);
    expect(raised.overrideRuleName).toBe('wildlife-indoors');
    expect(raised.isCritical()).toBe(true);
  });

  it('O7 — a Critical row ranks above a higher-scoring High row (4.4.4)', () => {
    const ranking = new PriorityRanking();
    const high = calculator().score(subject(PestType.Mosquito, 'Alpha'), c.pestProfile(PestType.Mosquito), { caseSize: 250, caseGrowthDelta: 30, rainfall24h: 50, rainfall72h: 120, verifiedOpenReports: 5, daysSinceLastTreatment: 90, premisesMix: 1 }, ctx);
    const critical = calculator().withOverride(
      calculator().score(subject(PestType.Snake, 'Zebra'), snakeProfile, { verifiedOpenReports: 1 }, ctx),
      { ruleNames: ['wildlife-indoors'] },
    );
    expect(high.tier).toBe(PriorityTier.High);
    ranking.add(high, { severityMultiplier: 1, verifiedOpenReportCount: 5, locality: 'Alpha' });
    ranking.add(critical, { severityMultiplier: 0.75, verifiedOpenReportCount: 1, locality: 'Zebra' });
    ranking.rank();
    expect(ranking.top(1)[0]?.pestType).toBe(PestType.Snake);
    expect(ranking.byTier(PriorityTier.Critical)).toHaveLength(1);
  });

  it('O8 — a report matching both rules names both (4.4.6)', () => {
    const outcome = evaluator().evaluate(
      [report({
        pestType: PestType.Snake,
        locationContext: LocationContext.Indoor,
        injuryReported: true,
      })],
      snakeProfile,
    );
    expect(outcome.ruleNames.sort()).toEqual(['injury', 'wildlife-indoors']);
  });

  /**
   * O9. An override that silently fails to load looks exactly like an override that never matched.
   * Every other failure here is loud; this one would be silent, so it is refused at construction.
   */
  it('O9 — an evaluator with no rules is refused rather than silently unarmed (4.4.2)', () => {
    expect(() => new CriticalOverrideEvaluator([])).toThrow(/no critical override rules/);
    const bare = new ConfigSet();
    expect(() => bare.validatePestProfiles()).toThrow();
  });

  it('O10 — the rule is describable in words, for the row and the notification (4.4.6, 4.4.9)', () => {
    expect(evaluator().describe(['wildlife-indoors'])).toMatch(/indoors/i);
  });
});

// ---------------------------------------------------------------- §6.4 referral (8.6)

describe('F: referral to an external authority (8.6, 8.1.14)', () => {
  const c = config();
  let reports: InMemoryReportStore;
  let referrals: InMemoryReferralStore;
  let controller: ReferralController;
  let workOrders: InMemoryWorkOrderStore;
  let treatments: InMemoryTreatmentRecordStore;
  let dispatch: DispatchController;
  let clusters: InMemoryClusterStore;
  let resident: RecordingNotifier;
  let storedClusterId = '';
  const clusterId = (): string => storedClusterId;

  beforeEach(async () => {
    const ac = new AccessControlService(new AccessPolicy(), new InMemoryAuditStore());
    reports = new InMemoryReportStore();
    referrals = new InMemoryReferralStore();
    workOrders = new InMemoryWorkOrderStore();
    treatments = new InMemoryTreatmentRecordStore();
    clusters = new InMemoryClusterStore();
    // A real notifier, not null: 8.6.6 is a message, and a null notifier makes every assertion
    // about what the resident was told vacuously true.
    resident = new RecordingNotifier();
    const lifecycle = new ReportLifecycleController(new ReportTransitionTable(), reports, resident);
    controller = new ReferralController(ac, reports, referrals, lifecycle, c, new InMemoryAuditStore());

    const cluster = new Cluster();
    Object.assign(cluster, {
      objectId: 'cluster-1', locality: 'Bedok North Avenue 3',
      boundary: new Polygon([]), caseSize: 10, premisesMix: new PremisesMix([], [], []),
      caseDelta: 0, changeClass: ChangeClass.UNCHANGED, forecastRegion: ForecastRegion.east,
      heavyRainExpected: false, trajectory: Trajectory.Stable, firstSeenAt: NOW,
      lastUpdatedAt: NOW, isActive: true,
    });
    await clusters.upsertFromFeed({ retrievedAt: NOW, records: [cluster] });
    storedClusterId = ((await clusters.findActive())[0] as Cluster).id;

    dispatch = new DispatchController(
      ac,
      new WorkOrderLifecycleController(
        new WorkOrderTransitionTable(), workOrders, treatments, new RecordingNotifier(), null,
      ),
      workOrders, clusters, new InMemoryPriorityScoreStore(), new RecordingNotifier(),
      null, 10, null, c,
    );
  });

  async function verifiedWildlifeReport(): Promise<Report> {
    const r = report({ pestType: PestType.WildBoar, locationContext: LocationContext.Outdoor });
    return reports.save(r);
  }

  it('F1 — work-order creation is refused for a wildlife pest, naming the authority (8.1.14, 8.1.15)', async () => {
    await expect(
      dispatch.createWorkOrder(
        {
          clusterId: clusterId(),
          pestType: PestType.WildBoar,
          taskType: TaskType.Inspection,
          scheduledDate: '2099-01-01',
        },
        MANAGER,
      ),
    ).rejects.toThrow(/AVS[\s\S]*refer the report instead|refer the report instead/);
    expect(await workOrders.findOpenForCluster(clusterId())).toHaveLength(0);
  });

  it('F1b — a non-wildlife pest is still dispatched, and carries its pest type (8.1.16)', async () => {
    const wo = await dispatch.createWorkOrder(
      { clusterId: clusterId(), pestType: PestType.Mosquito, taskType: TaskType.Fogging, scheduledDate: '2099-01-01' },
      MANAGER,
    );
    expect(wo.pestType).toBe(PestType.Mosquito);
  });

  it('F1c — fogging is not a response to a rat (8.1.17)', async () => {
    await expect(
      dispatch.createWorkOrder(
        { clusterId: clusterId(), pestType: PestType.Termite, taskType: TaskType.Fogging, scheduledDate: '2099-01-01' },
        MANAGER,
      ),
    ).rejects.toThrow(/8\.1\.17/);
  });

  it('F2 — a referral records destination, referrer, time and reason, and Actions the report', async () => {
    const r = await verifiedWildlifeReport();
    const referral = await controller.refer(r.id, 'Boar seen repeatedly at the void deck bins.', MANAGER, NOW);

    expect(referral.destinationAuthority).toContain('AVS');
    expect(referral.referredBy).toBe(MANAGER.accountId);
    expect(referral.referredAt).toEqual(NOW);
    expect((await reports.findById(r.id))?.currentStatus()).toBe(ReportStatus.Actioned);
  });

  /**
   * F3 and F4 are one defect in two places. Writing a treatment record on referral is the natural
   * thing for a developer to do — the case is closed, after all — and it would corrupt 4.1.17's
   * feedback loop by telling the scorer a locality was treated when nobody treated it. F3 catches
   * the write; F4 catches the consequence, so removing the write without understanding why still
   * leaves a test standing.
   */
  it('F3 — a referral writes no work order and no treatment record (8.6.10, 8.6.11)', async () => {
    const r = await verifiedWildlifeReport();
    await controller.refer(r.id, 'Boar seen repeatedly at the void deck bins.', MANAGER, NOW);

    expect(await workOrders.findOpenForCluster(clusterId())).toHaveLength(0);
    expect(await treatments.allForCluster(clusterId())).toHaveLength(0);
  });

  it('F4 — treatment recency is untouched by a referral (8.6.11)', async () => {
    const r = await verifiedWildlifeReport();
    const before = (await treatments.allForCluster(clusterId())).length;
    await controller.refer(r.id, 'Boar seen repeatedly at the void deck bins.', MANAGER, NOW);
    expect(await treatments.allForCluster(clusterId())).toHaveLength(before);
  });

  it('F5 — recording the outcome closes the report (8.6.8, 8.6.9)', async () => {
    const r = await verifiedWildlifeReport();
    const referral = await controller.refer(r.id, 'Boar seen repeatedly at the void deck bins.', MANAGER, NOW);
    await controller.recordOutcome(referral.id, 'AVS attended and relocated the animal.', MANAGER, NOW);

    expect((await reports.findById(r.id))?.currentStatus()).toBe(ReportStatus.Closed);
    expect((await referrals.findById(referral.id))?.isClosed()).toBe(true);
    expect(await controller.openReferrals(MANAGER)).toHaveLength(0);
  });

  it('F6 — a pest with no configured authority cannot be referred (6.10.EX.2)', async () => {
    const bare = new ConfigSet();
    const ac = new AccessControlService(new AccessPolicy(), new InMemoryAuditStore());
    const unconfigured = new ReferralController(
      ac, reports, referrals,
      new ReportLifecycleController(new ReportTransitionTable(), reports, null),
      bare,
    );
    expect(() => unconfigured.destinationFor(PestType.Snake)).toThrow(ReferralRefused);
  });

  it('F7 — an unverified report is refused, and a reason of "n/a" is too (8.6.1, 8.6.4)', async () => {
    const pending = await reports.save(
      report({ pestType: PestType.WildBoar, status: ReportStatus.Submitted } as Partial<Report> & { pestType: PestType }),
    );
    await expect(controller.refer(pending.id, 'A boar was seen at the bins.', MANAGER, NOW)).rejects.toThrow(
      /not Verified/,
    );

    const verified = await verifiedWildlifeReport();
    await expect(controller.refer(verified.id, 'n/a', MANAGER, NOW)).rejects.toThrow(/at least 10/);
  });

  /**
   * F8 and F9 were not in the designed set. They are here because 8.6.6 was unwired *and* the
   * behaviour standing in its place was a false statement to the resident: the referral sets the
   * report Actioned (8.6.5), 5.2.8 fires on that move, and the default Actioned wording told a
   * resident whose snake went to AVS that it "has been scheduled for treatment". Nothing was
   * scheduled and nothing was treated. A missing notification is a gap; a wrong one is a defect.
   */
  it('F8 — the resident is told their report was referred, and to whom (8.6.6)', async () => {
    const r = await verifiedWildlifeReport();
    await controller.refer(r.id, 'Boar seen repeatedly at the void deck bins.', MANAGER, NOW);

    const sent = resident.to(RESIDENT.accountId);
    expect(sent).toHaveLength(1);
    // Naming the authority is the requirement, so it is asserted literally rather than by a
    // "referred" keyword that would pass on a message naming nobody.
    expect(sent[0]).toContain('AVS');
    expect(sent[0]).toMatch(/referred to/i);
    // The sentence this replaced. If it ever comes back, this is the line that fails.
    expect(sent[0]).not.toMatch(/scheduled for treatment/);
  });

  it('F9 — closing a referral does not claim D-Fence treated anything (8.6.9, 8.6.11)', async () => {
    const r = await verifiedWildlifeReport();
    const referral = await controller.refer(r.id, 'Boar seen repeatedly at the void deck bins.', MANAGER, NOW);
    await controller.recordOutcome(referral.id, 'AVS attended and relocated the animal.', MANAGER, NOW);

    const closing = resident.to(RESIDENT.accountId)[1] ?? '';
    expect(closing).toContain('AVS');
    expect(closing).toContain('relocated the animal');
    // 8.6.11 writes no TreatmentRecord, so the resident must not be told there was a treatment.
    expect(closing).not.toMatch(/has been treated/);
  });
});
