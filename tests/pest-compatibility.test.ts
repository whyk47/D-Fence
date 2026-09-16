/**
 * D-Fence — requirement 4.2.5, the compatibility obligation.
 *
 * "The system shall compute a priority score for the mosquito pest type that equals the weighted sum
 * of the seven drivers named in version 0.8 of requirement 4.1.3, on the same 0–100 scale."
 *
 * This is the first test written for the cross-pest generalisation, before any other line of it, and
 * it is the one whose failure means the widening must be backed out rather than fixed. Design:
 * lab4/TEST-PLAN.md §6.1, cases C1–C5.
 *
 * **Why the expected values are literals.** They were produced by `tests/fixtures/generate-v08-goldens.ts`
 * running against the v0.8 `PriorityScoringEngine` *before* the split, and pasted here. A golden that
 * is recomputed by the code under test asserts nothing at all — it would pass just as happily if
 * every score had moved together.
 */
import { describe, expect, it } from 'vitest';
import { Driver, EvidenceTier, PestType, PriorityTier } from '../src/entity/enums';
import { ConfigLoader } from '../src/config/ConfigLoader';
import { ConfigSet } from '../src/config/ConfigSet';
import { NormalisationFactory } from '../src/control/normalisation/NormalisationFactory';
import { PriorityScoringEngine } from '../src/control/PriorityScoringEngine';
import { UrgencyCalculator } from '../src/control/scoring/UrgencyCalculator';
import { PestPriorityCalculator } from '../src/control/scoring/PestPriorityCalculator';
import { TIER_A_DRIVERS } from '../src/entity/PestProfile';
import type { PriorityScoreStore } from '../src/ports/Stores';
import { DENGUE_FIXTURES, FIXTURE_NOW } from './fixtures/dengue-v08';

/** Transcribed from the v0.8 engine on 2026-09-16. Do not regenerate these from current code. */
const V08_GOLDENS: Record<string, { score: number; tier: PriorityTier; contributions: number }> = {
  d1: { score: 62.6, tier: PriorityTier.Medium, contributions: 7 },
  d2: { score: 30.0, tier: PriorityTier.Low, contributions: 7 },
  d3: { score: 63.7, tier: PriorityTier.Medium, contributions: 7 },
  d4: { score: 0.0, tier: PriorityTier.Low, contributions: 7 },
  // Two drivers absent, so 4.1.19 renormalises the remaining five weights to 1.0.
  d5: { score: 57.0, tier: PriorityTier.Medium, contributions: 5 },
};

function config(): ConfigSet {
  return ConfigLoader.load();
}

function engine(c = config()): PriorityScoringEngine {
  return new PriorityScoringEngine(
    NormalisationFactory.build(c.normalisation),
    c,
    {} as PriorityScoreStore,
  );
}

const ctx = {
  observedMin: Math.min(...DENGUE_FIXTURES.map((f) => f.cluster.caseSize)),
  observedMax: Math.max(
    ...DENGUE_FIXTURES.map((f) => f.cluster.caseSize),
    ...DENGUE_FIXTURES.map((f) => f.cluster.caseDelta ?? 0),
  ),
  now: FIXTURE_NOW,
};

describe('4.2.5 — the generalised scorer reproduces every v0.8 dengue score exactly', () => {
  /**
   * C1. Bit-identical, not "within a tolerance". The claim 4.2.5 makes is an identity — sigma is
   * 1.000 and the tier A weights are v0.8's, so the arithmetic is the same arithmetic — and a
   * tolerance would hide precisely the drift the requirement exists to forbid.
   */
  it.each(DENGUE_FIXTURES)('C1 — $name scores what v0.8 scored', ({ cluster, inputs }) => {
    const golden = V08_GOLDENS[cluster.id];
    expect(golden, `no golden recorded for ${cluster.id}`).toBeDefined();

    const score = engine().scoreOne(cluster, inputs, ctx);

    expect(score.score).toBe(golden!.score);
    expect(score.tier).toBe(golden!.tier);
    expect(score.contributions).toHaveLength(golden!.contributions);
    expect(score.pestType).toBe(PestType.Mosquito);
    expect(score.evidenceTier).toBe(EvidenceTier.A);
  });

  /**
   * C1b. The degraded fixture, stated separately because it is the case where the generalisation
   * could most plausibly have broken something quietly: v0.8 derived `excludedDrivers` by walking
   * the whole `Driver` enum, which in v0.9 would name the four tier B/C drivers as well and mark
   * every dengue score degraded for drivers a mosquito never had.
   */
  it('C1b — a degraded score names exactly the two rainfall drivers, not the four v0.9 ones', () => {
    const d5 = DENGUE_FIXTURES.find((f) => f.cluster.id === 'd5')!;
    const score = engine().scoreOne(d5.cluster, d5.inputs, ctx);

    expect(score.isDegraded).toBe(true);
    expect([...score.excludedDrivers].sort()).toEqual([Driver.Rainfall24h, Driver.Rainfall72h]);
    expect(score.excludedDrivers).not.toContain(Driver.ExternalObservationDensity);
    expect(score.excludedDrivers).not.toContain(Driver.ReportVelocity);
  });

  /**
   * C2. The load-bearing constant. If sigma(Mosquito) is anything but exactly 1.0 then every dengue
   * score moves and C1 fails — but C2 says *why* it failed, in one line, instead of leaving five
   * fixture failures to be diagnosed.
   */
  it('C2 — the mosquito severity multiplier is exactly 1.0', () => {
    expect(config().pestProfile(PestType.Mosquito).severityMultiplier).toBe(1.0);
  });

  /** C3. The tier boundaries, through the new severity path rather than on a bare number. */
  it.each([
    [39.9, PriorityTier.Low],
    [40.0, PriorityTier.Medium],
    [40.1, PriorityTier.Medium],
    [69.9, PriorityTier.Medium],
    [70.0, PriorityTier.High],
    [70.1, PriorityTier.High],
  ])('C3 — a mosquito scoring %s is still %s', (score, tier) => {
    expect(engine().assignTier(score as number)).toBe(tier);
  });

  /** C4. The tier A driver set, in the v0.8 order. 4.3.4 restates v0.8's 4.1.3 verbatim. */
  it('C4 — evidence tier A names the seven v0.8 drivers, in order', () => {
    expect(config().pestProfile(PestType.Mosquito).drivers()).toEqual([
      Driver.CaseSize,
      Driver.CaseGrowthDelta,
      Driver.Rainfall24h,
      Driver.Rainfall72h,
      Driver.VerifiedOpenReportCount,
      Driver.DaysSinceLastTreatment,
      Driver.PremisesMix,
    ]);
    expect(TIER_A_DRIVERS).toHaveLength(7);
  });

  /**
   * C5. What protects C1 from passing on a catalogue that is uniformly wrong.
   *
   * If every severity multiplier were scaled down by the same factor, the pests would still rank
   * correctly against each other and every score, every tier threshold and every alert would be
   * wrong. C1 alone cannot see that; 4.2.7 can, and this is the test that it is enforced.
   */
  it('C5 — a catalogue whose highest severity multiplier is below 1.0 is refused', () => {
    const c = config();
    const mosquito = c.pestProfile(PestType.Mosquito);
    for (const [pest, profile] of c.pestProfiles) {
      c.pestProfiles.set(
        pest,
        Object.assign(Object.create(Object.getPrototypeOf(profile)), profile, {
          severityMultiplier: profile.severityMultiplier * 0.9,
        }),
      );
    }
    expect(mosquito.severityMultiplier).toBe(1.0);
    expect(() => c.validatePestProfiles()).toThrow(/4\.2\.7/);
  });

  /**
   * The composition itself, isolated from the fixtures. 4.2.4 is `100 x sigma x urgency`, and at
   * sigma = 1 that is 100 x urgency — which is what v0.8's `applyWeights` returned.
   */
  it('C6 — severity 1.0 makes the score exactly 100 x urgency, to one decimal place', () => {
    const c = config();
    const calculator = new PestPriorityCalculator(
      new UrgencyCalculator(NormalisationFactory.build(c.normalisation)),
      c.tierThresholds,
    );
    const mosquito = c.pestProfile(PestType.Mosquito);
    expect(calculator.applySeverity(0.626, mosquito)).toBe(62.6);
    expect(calculator.applySeverity(1, mosquito)).toBe(100);
    expect(calculator.applySeverity(0, mosquito)).toBe(0);
  });
});
