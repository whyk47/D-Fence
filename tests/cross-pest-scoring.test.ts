/**
 * D-Fence — the cycle that turns v0.9's evidence into scores (4.1.22–4.1.26, 4.2.1–4.2.4).
 *
 * Steps 7 and 8 built two evidence sources and tested them thoroughly; this file tests the thing
 * that was missing between them and a ranked queue. Without it the registry and the observation
 * feed were collected, stored, counted — and read by nothing.
 */
import { describe, expect, it } from 'vitest';
import { CrossPestScoringService } from '../src/control/scoring/CrossPestScoringService';
import { CriticalOverrideEvaluator } from '../src/control/scoring/CriticalOverrideEvaluator';
import { CriticalEscalationNotifier } from '../src/control/CriticalEscalationNotifier';
import { InMemoryAccountStore } from '../src/persistence/memory/InMemoryAccountStores';
import { RecordingNotifier } from '../src/persistence/memory/InMemoryWorkOrderStores';
import { Account } from '../src/entity/Account';
import { PriorityScore } from '../src/entity/PriorityScore';
import { PestPriorityCalculator } from '../src/control/scoring/PestPriorityCalculator';
import { UrgencyCalculator } from '../src/control/scoring/UrgencyCalculator';
import { NormalisationFactory } from '../src/control/normalisation/NormalisationFactory';
import { ConfigSet } from '../src/config/ConfigSet';
import { ConfigLoader } from '../src/config/ConfigLoader';
import { InMemoryReportStore } from '../src/persistence/memory/InMemoryReportStores';
import {
  InMemoryObservationStore,
  InMemoryOperatorRegistryStore,
} from '../src/persistence/memory/InMemoryPestReferenceStores';
import { InMemoryTreatmentRecordStore } from '../src/persistence/memory/InMemoryWorkOrderStores';
import { ObservationRecord } from '../src/entity/ObservationRecord';
import { VectorControlOperator } from '../src/entity/VectorControlOperator';
import { Report } from '../src/entity/Report';
import { Cluster } from '../src/entity/Cluster';
import {
  Driver,
  LocationContext,
  PestType,
  PriorityTier,
  ReportStatus,
  ReportType,
  Role,
} from '../src/entity/enums';
import { GeoPoint, Polygon, Uuid } from '../src/entity/valueTypes';
import { pestReportKey } from '../src/ports/Stores';

const NOW = new Date('2026-09-17T02:00:00Z');
const LOCALITY_ID = '11111111-1111-4111-8111-111111111111';

function locality(): Cluster {
  return Object.assign(new Cluster(), {
    id: LOCALITY_ID,
    locality: 'Bedok North Ave 1',
    caseSize: 12,
    caseDelta: 2,
    boundary: new Polygon([
      [
        new GeoPoint(1.33, 103.79),
        new GeoPoint(1.35, 103.79),
        new GeoPoint(1.35, 103.81),
        new GeoPoint(1.33, 103.81),
      ],
    ]),
  });
}

function report(
  pestType: PestType,
  status: ReportStatus,
  submittedAt: Date,
  id: Uuid = `r-${Math.random()}`,
  over: Partial<Report> = {},
): Report {
  const r = new Report();
  r.id = id;
  r.reporterId = 'acct-1';
  r.point = new GeoPoint(1.34, 103.8);
  r.type = ReportType.StandingWater;
  r.description = 'seen by the bin chute';
  r.pestType = pestType;
  r.clusterId = LOCALITY_ID;
  r.localityBinding = 'Bedok North Ave 1';
  r.corroborationCount = 0;
  r.submittedAt = submittedAt;
  Object.assign(r, over);
  r.applyStatus(status);
  return r;
}

function service(
  reports: InMemoryReportStore,
  observations: InMemoryObservationStore,
  registry: InMemoryOperatorRegistryStore,
  withOverride = false,
): {
  svc: CrossPestScoringService;
  config: ConfigSet;
} {
  const config = ConfigLoader.load();
  const calculator = new PestPriorityCalculator(
    new UrgencyCalculator(NormalisationFactory.build(config.normalisation)),
    config.tierThresholds,
  );
  return {
    svc: new CrossPestScoringService(
      calculator,
      reports,
      observations,
      registry,
      new InMemoryTreatmentRecordStore(),
      withOverride ? new CriticalOverrideEvaluator(config.criticalOverrideRules) : null,
    ),
    config,
  };
}

const ctx = { observedMin: 0, observedMax: 12, now: NOW };

describe('Report drivers grouped by locality and pest (4.1.3, 4.1.23, 4.1.26)', () => {
  it('X1 — reports of different pests in one locality are counted separately', async () => {
    const reports = new InMemoryReportStore();
    await reports.save(report(PestType.Rat, ReportStatus.Verified, NOW));
    await reports.save(report(PestType.Rat, ReportStatus.Verified, NOW));
    await reports.save(report(PestType.Cockroach, ReportStatus.Verified, NOW));

    const counts = await reports.reportDriversByLocalityAndPest(new Date(NOW.getTime() - 14 * 86_400_000));

    // v0.8 grouped by cluster alone. Left that way, a locality's rats and cockroaches would have
    // scored as one number and every pest in it would have shared the others' evidence.
    expect(counts.get(pestReportKey(LOCALITY_ID, PestType.Rat))?.verifiedOpen).toBe(2);
    expect(counts.get(pestReportKey(LOCALITY_ID, PestType.Cockroach))?.verifiedOpen).toBe(1);
  });

  it('X2 — velocity counts submissions inside the window, verified or not', async () => {
    const reports = new InMemoryReportStore();
    await reports.save(report(PestType.Rat, ReportStatus.Verified, NOW));
    await reports.save(report(PestType.Rat, ReportStatus.Submitted, NOW));
    await reports.save(report(PestType.Rat, ReportStatus.Verified, new Date(NOW.getTime() - 30 * 86_400_000)));

    const counts = await reports.reportDriversByLocalityAndPest(new Date(NOW.getTime() - 14 * 86_400_000));
    const row = counts.get(pestReportKey(LOCALITY_ID, PestType.Rat));

    // 4.1.23 measures how fast a place is complaining. Moderation lag is a property of us, not of
    // the place, so an unmoderated report still counts towards velocity.
    expect(row?.recent).toBe(2);
    // 4.1.3 counts what is open now, whenever it was reported — so the 30-day-old verified one is
    // included even though it is outside the velocity window. The Submitted one is not: 5.2.5
    // counts verified reports, and an unmoderated claim is not yet evidence.
    expect(row?.verifiedOpen).toBe(2);
  });
});

describe('Cross-pest scoring (4.2.1-4.2.4, 4.3.4-4.3.6)', () => {
  it('X3 — a pest with no evidence in a locality is not scored at all', async () => {
    const reports = new InMemoryReportStore();
    await reports.save(report(PestType.Rat, ReportStatus.Verified, NOW));
    const { svc, config } = service(reports, new InMemoryObservationStore(), new InMemoryOperatorRegistryStore());

    const scores = await svc.scoreAll([locality()], config.pestProfiles, ctx);

    // Not "scored zero" — not a subject. Scoring all 22 pests in every locality would publish a
    // ranked queue of several hundred rows, almost all of them nothing.
    expect(scores).toHaveLength(1);
    expect(scores[0]?.pestType).toBe(PestType.Rat);
  });

  it('X4 — the mosquito is never scored here, because the tier A cycle scores it', async () => {
    const reports = new InMemoryReportStore();
    await reports.save(report(PestType.Mosquito, ReportStatus.Verified, NOW));
    await reports.save(report(PestType.Rat, ReportStatus.Verified, NOW));
    const { svc, config } = service(reports, new InMemoryObservationStore(), new InMemoryOperatorRegistryStore());

    const scores = await svc.scoreAll([locality()], config.pestProfiles, ctx);

    // Two scorers for one subject means the one that ran second wins, silently. 4.2.5's goldens
    // were cut from PriorityScoringEngine, so that is the one that keeps the mosquito.
    expect(scores.map((s) => s.pestType)).toEqual([PestType.Rat]);
  });

  it('X5 — an observation alone is evidence enough to score a tier B pest (1.5.9 into 4.1.24)', async () => {
    const observations = new InMemoryObservationStore();
    await observations.save([
      new ObservationRecord(
        'obs-1',
        PestType.Snake,
        'Ptyas korros',
        new Date(NOW.getTime() - 3 * 86_400_000),
        new GeoPoint(1.34, 103.8),
        20,
        'research',
        LOCALITY_ID,
      ),
    ]);
    const { svc, config } = service(new InMemoryReportStore(), observations, new InMemoryOperatorRegistryStore());

    const scores = await svc.scoreAll([locality()], config.pestProfiles, ctx);

    // This is the assertion that would have failed before this pass: step 8 ingested observations
    // that reached no score, so a locality with sightings and no reports scored nothing at all.
    expect(scores.map((s) => s.pestType)).toEqual([PestType.Snake]);
    const observed = scores[0]?.contributions.find((c) => c.driver === Driver.ExternalObservationDensity);
    expect(observed?.rawValue).toBe(1);
  });

  it('X6 — the operator registry reaches the score, and its absence excludes the driver (4.1.9, 1.6.8)', async () => {
    const reports = new InMemoryReportStore();
    await reports.save(report(PestType.Rat, ReportStatus.Verified, NOW));

    const empty = new InMemoryOperatorRegistryStore();
    const withRegistry = new InMemoryOperatorRegistryStore();
    await withRegistry.saveRegistry(
      [new VectorControlOperator('ALPHA', '1', 'Anson Road', '528844', '6', new GeoPoint(1.35, 103.8))],
      new Date('2024-06-06T00:00:00Z'),
    );

    const bare = await service(reports, new InMemoryObservationStore(), empty).svc.scoreAll(
      [locality()],
      service(reports, new InMemoryObservationStore(), empty).config.pestProfiles,
      ctx,
    );
    const fed = await service(reports, new InMemoryObservationStore(), withRegistry).svc.scoreAll(
      [locality()],
      service(reports, new InMemoryObservationStore(), withRegistry).config.pestProfiles,
      ctx,
    );

    // No registry: the driver is excluded and the score marked degraded, and 4.1.9 redistributes
    // its weight. Not fed as the 8 km cap — "we have no registry" is not "help is far away".
    expect(bare[0]?.excludedDrivers).toContain(Driver.ResponseCapacityDeficit);
    expect(bare[0]?.isDegraded).toBe(true);

    const contribution = fed[0]?.contributions.find((c) => c.driver === Driver.ResponseCapacityDeficit);
    expect(contribution).toBeDefined();
    // 0.01 degrees of latitude from the locality centroid, to the metre.
    expect(Math.round(contribution?.rawValue ?? 0)).toBe(1112);
    expect(fed[0]?.excludedDrivers).not.toContain(Driver.ResponseCapacityDeficit);
  });

  it('X7 — a tier C pest is scored on five drivers and never asks for an observation count', async () => {
    // BedBug, not Cockroach: the catalogue puts Cockroach in tier B (Blattodea, taxon 81769), and
    // picking it here would have tested tier B while claiming to test tier C.
    const reports = new InMemoryReportStore();
    await reports.save(report(PestType.BedBug, ReportStatus.Verified, NOW));
    const observations = new InMemoryObservationStore();
    const registry = new InMemoryOperatorRegistryStore();
    await registry.saveRegistry(
      [new VectorControlOperator('ALPHA', '1', 'Anson Road', '528844', '6', new GeoPoint(1.35, 103.8))],
      null,
    );
    const { svc, config } = service(reports, observations, registry);

    const scores = await svc.scoreAll([locality()], config.pestProfiles, ctx);

    const bedbug = scores.find((s) => s.pestType === PestType.BedBug);
    expect(bedbug).toBeDefined();
    expect(bedbug?.contributions).toHaveLength(5); // 4.3.6
    // 4.3.6 gives tier C no observation driver, so a value for it would be ignored at best and
    // misleading in the breakdown at worst.
    expect(bedbug?.contributions.map((c) => c.driver)).not.toContain(Driver.ExternalObservationDensity);
    expect(bedbug?.isDegraded).toBe(false);
  });
});

describe('The critical override, in the cycle rather than in a test (4.4.1-4.4.6, 4.4.9)', () => {
  /**
   * X8 is the case that would have failed before this pass, and it is worth saying why it could
   * not have been caught by the §6.3 override cases. Those construct a `CriticalOverrideEvaluator`
   * and call it directly, so they prove the rules are right. Nothing proved anything *called* it:
   * `withOverride` and the evaluator were reached only by their own tests and by type-imports.
   * Requirement group 4.4 was implemented, green, and never executed against a real score.
   */
  it('X8 — a snake reported indoors is raised to Critical by the scoring cycle', async () => {
    const reports = new InMemoryReportStore();
    await reports.save(
      report(PestType.Snake, ReportStatus.Verified, NOW, 'r-snake', {
        locationContext: LocationContext.Indoor,
      }),
    );
    const { svc, config } = service(
      reports,
      new InMemoryObservationStore(),
      new InMemoryOperatorRegistryStore(),
      true,
    );

    const scores = await svc.scoreAll([locality()], config.pestProfiles, ctx);
    const snake = scores.find((s) => s.pestType === PestType.Snake);

    expect(snake?.tier).toBe(PriorityTier.Critical);
    expect(snake?.overrideRuleName).toContain('wildlife-indoors');
  });

  it('X9 — the override raises the tier and leaves the score exactly where it was (4.4.5)', async () => {
    const indoors = (): Report =>
      report(PestType.Snake, ReportStatus.Verified, NOW, 'r-snake', {
        locationContext: LocationContext.Indoor,
      });

    const plainStore = new InMemoryReportStore();
    await plainStore.save(indoors());
    const plain = service(plainStore, new InMemoryObservationStore(), new InMemoryOperatorRegistryStore(), false);

    const raisedStore = new InMemoryReportStore();
    await raisedStore.save(indoors());
    const raised = service(raisedStore, new InMemoryObservationStore(), new InMemoryOperatorRegistryStore(), true);

    const before = (await plain.svc.scoreAll([locality()], plain.config.pestProfiles, ctx))[0];
    const after = (await raised.svc.scoreAll([locality()], raised.config.pestProfiles, ctx))[0];

    // The whole of 4.4.5 in one assertion. Raising the score to 100 instead would put the case at
    // the top of the table and also tell every downstream reader the evidence is overwhelming,
    // which it is not: this is one report.
    expect(after?.score).toBe(before?.score);
    expect(before?.tier).not.toBe(PriorityTier.Critical);
    expect(after?.tier).toBe(PriorityTier.Critical);
  });

  it('X10 — an unverified report does not raise anything (4.4.1)', async () => {
    const reports = new InMemoryReportStore();
    await reports.save(
      report(PestType.Snake, ReportStatus.Submitted, NOW, 'r-snake', {
        locationContext: LocationContext.Indoor,
      }),
    );
    // Velocity counts it, so the pair is still a subject — it is the *override* that must not fire.
    const { svc, config } = service(
      reports,
      new InMemoryObservationStore(),
      new InMemoryOperatorRegistryStore(),
      true,
    );

    const snake = (await svc.scoreAll([locality()], config.pestProfiles, ctx)).find(
      (s) => s.pestType === PestType.Snake,
    );

    // A Critical tier anyone could trigger by filing a report is a denial of service against the
    // manager's attention.
    expect(snake).toBeDefined();
    expect(snake?.tier).not.toBe(PriorityTier.Critical);
  });
});

describe('N: the Operations Manager is told (4.4.9)', () => {
  function critical(pestType: PestType, localityId = LOCALITY_ID): PriorityScore {
    const s = new PriorityScore();
    s.localityId = localityId;
    s.clusterId = localityId;
    s.pestType = pestType;
    s.score = 21.4;
    s.tier = PriorityTier.Critical;
    s.overrideRuleName = 'wildlife-indoors';
    return s;
  }

  async function managers(): Promise<{ accounts: InMemoryAccountStore; sent: RecordingNotifier; id: string }> {
    const accounts = new InMemoryAccountStore();
    const account = new Account();
    account.email = 'ops@dfence.sg';
    account.authUserId = 'auth-ops';
    account.role = Role.OperationsManager;
    account.isActive = true;
    account.emailVerified = true;
    const saved = await accounts.save(account);
    return { accounts, sent: new RecordingNotifier(), id: saved.id };
  }

  it('N1 — a subject raised to Critical is announced, naming the pest, the place and the rule', async () => {
    const { accounts, sent, id } = await managers();
    const notifier = new CriticalEscalationNotifier(accounts, sent);

    await notifier.announce([{ score: critical(PestType.Snake), locality: 'Bedok North Ave 1' }]);

    const messages = sent.to(id);
    expect(messages).toHaveLength(1);
    // 4.4.6 — "Critical" alone tells a manager to look; the rule tells them what they are looking
    // at, and whether it needs a call to AVS tonight or a visit tomorrow.
    expect(messages[0]).toContain('Snake');
    expect(messages[0]).toContain('Bedok North Ave 1');
    expect(messages[0]).toContain('wildlife-indoors');
  });

  it('N2 — the same subject still Critical next cycle is not announced again', async () => {
    const { accounts, sent, id } = await managers();
    const notifier = new CriticalEscalationNotifier(accounts, sent);
    const subject = [{ score: critical(PestType.Snake), locality: 'Bedok North Ave 1' }];

    await notifier.announce(subject);
    await notifier.announce(subject);

    // 4.4.9 is "raised to", a transition, not a state. Announcing the state every cycle would send
    // the same snake every fifteen minutes until someone dealt with it, and a stream that repeats
    // is one a manager learns to ignore — which defeats the requirement rather than meeting it.
    expect(sent.to(id)).toHaveLength(1);
  });

  it('N3 — a subject that falls out of Critical and returns is announced again', async () => {
    const { accounts, sent, id } = await managers();
    const notifier = new CriticalEscalationNotifier(accounts, sent);
    const subject = [{ score: critical(PestType.Snake), locality: 'Bedok North Ave 1' }];

    await notifier.announce(subject);
    await notifier.announce([]); // the report was closed; the subject is no longer Critical
    await notifier.announce(subject); // and it happens again

    // The second escalation is a new event. Suppressing it would be the failure mode N2 guards
    // against, applied to a case nobody has seen.
    expect(sent.to(id)).toHaveLength(2);
  });

  it('N4 — a non-Critical score notifies nobody', async () => {
    const { accounts, sent, id } = await managers();
    const notifier = new CriticalEscalationNotifier(accounts, sent);
    const high = critical(PestType.Rat);
    high.tier = PriorityTier.High;

    const raised = await notifier.announce([{ score: high, locality: 'Bedok North Ave 1' }]);

    expect(raised).toHaveLength(0);
    expect(sent.to(id)).toHaveLength(0);
  });
});
