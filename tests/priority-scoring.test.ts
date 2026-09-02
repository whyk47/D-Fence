/**
 * D-Fence — Lab 4 §3.2.1: equivalence-class and boundary-value tests for one key control class.
 *
 * Subject: PriorityScoringEngine, chosen because it is the computational core — the class the
 * module's "data processing" criterion is judged on — and because 4.1.8 states its thresholds
 * precisely enough to test at the boundary rather than around it.
 *
 * Design is documented in lab4/TEST-PLAN.md §2. Case ids here match the ids in that table.
 */
import { describe, expect, it } from 'vitest';
import { TierThresholds } from '../src/entity/valueTypes';
import { Driver, PriorityTier } from '../src/entity/enums';
import { ConfigSet } from '../src/config/ConfigSet';
import { PriorityScoringEngine } from '../src/control/PriorityScoringEngine';
import { PriorityScoreRepository } from '../src/persistence/PriorityScoreRepository';
import { MinMaxNormalisation } from '../src/control/normalisation/MinMaxNormalisation';
import { LogScaleNormalisation } from '../src/control/normalisation/LogScaleNormalisation';
import { CappedLinearNormalisation } from '../src/control/normalisation/CappedLinearNormalisation';
import { RecencyDecayNormalisation } from '../src/control/normalisation/RecencyDecayNormalisation';
import { PremisesMixNormalisation } from '../src/control/normalisation/PremisesMixNormalisation';
import { NormalisationContext } from '../src/control/normalisation/NormalisationStrategy';

function engine(high = 70, medium = 40): PriorityScoringEngine {
  const config = new ConfigSet();
  Object.assign(config, { tierThresholds: new TierThresholds(high, medium) });
  return new PriorityScoringEngine(new Map(), config, {} as PriorityScoreRepository);
}

const ctx = (min: number, max: number): NormalisationContext => ({
  observedMin: min,
  observedMax: max,
  now: new Date('2026-09-03T00:00:00Z'),
});

/**
 * §2.1 — assignTier. Requirement 4.1.8 partitions the score domain into exactly three classes, so
 * the equivalence classes are given by the requirement rather than invented:
 *   EC1 score < 40.0            -> Low
 *   EC2 40.0 <= score <= 69.9   -> Medium
 *   EC3 score >= 70.0           -> High
 * plus two invalid classes, EC4 below 0 and EC5 above 100, which 4.1.7 says cannot occur.
 */
describe('EC: assignTier partitions the score domain (4.1.8)', () => {
  it('EC1 — a mid-class low score is Low', () => {
    expect(engine().assignTier(12.3)).toBe(PriorityTier.Low);
  });

  it('EC2 — a mid-class medium score is Medium', () => {
    expect(engine().assignTier(55.0)).toBe(PriorityTier.Medium);
  });

  it('EC3 — a mid-class high score is High', () => {
    expect(engine().assignTier(88.8)).toBe(PriorityTier.High);
  });
});

/**
 * §2.2 — boundary values. Six cases, three per threshold: just below, exactly on, just above.
 * "Exactly on" is the case that matters: 4.1.8 says "70.0 or above" and "between 40.0 and 69.9",
 * so a score of exactly 40.0 is Medium and exactly 70.0 is High. An implementation using > rather
 * than >= passes every equivalence-class case above and fails precisely here.
 */
describe('BV: the two tier thresholds (4.1.8)', () => {
  it('BV1 — 39.9 is Low', () => {
    expect(engine().assignTier(39.9)).toBe(PriorityTier.Low);
  });

  it('BV2 — exactly 40.0 is Medium, not Low', () => {
    expect(engine().assignTier(40.0)).toBe(PriorityTier.Medium);
  });

  it('BV3 — 40.1 is Medium', () => {
    expect(engine().assignTier(40.1)).toBe(PriorityTier.Medium);
  });

  it('BV4 — 69.9 is Medium', () => {
    expect(engine().assignTier(69.9)).toBe(PriorityTier.Medium);
  });

  it('BV5 — exactly 70.0 is High, not Medium', () => {
    expect(engine().assignTier(70.0)).toBe(PriorityTier.High);
  });

  it('BV6 — 70.1 is High', () => {
    expect(engine().assignTier(70.1)).toBe(PriorityTier.High);
  });

  it('BV7 — the extremes of the 4.1.7 scale', () => {
    expect(engine().assignTier(0)).toBe(PriorityTier.Low);
    expect(engine().assignTier(100)).toBe(PriorityTier.High);
  });

  it('BV8 — thresholds come from configuration (4.1.9), not from constants', () => {
    // Same score, different configured thresholds, different tier. This is what proves 4.1.9 —
    // a hard-coded 70 would pass every case above and fail this one.
    expect(engine(90, 50).assignTier(75)).toBe(PriorityTier.Medium);
  });
});

/**
 * §2.3 — normalisation output range. 4.1.4 requires every driver on [0, 1]; the weighted sum in
 * 4.1.7 assumes it, because one driver escaping the range silently outvotes the other six.
 * Equivalence classes per strategy: below range, in range, above range.
 */
describe('EC/BV: every normalisation strategy respects [0, 1] (4.1.4)', () => {
  it('N1 — MinMax maps the observed range onto the unit interval and clamps outside it', () => {
    const s = new MinMaxNormalisation();
    expect(s.normalise(0, ctx(0, 100))).toBe(0);
    expect(s.normalise(50, ctx(0, 100))).toBeCloseTo(0.5);
    expect(s.normalise(100, ctx(0, 100))).toBe(1);
    expect(s.normalise(10_000, ctx(0, 100))).toBe(1);
    expect(s.normalise(-1, ctx(0, 100))).toBe(0);
  });

  it('N2 — MinMax returns 0 when the range is degenerate, so a flat driver contributes nothing', () => {
    expect(new MinMaxNormalisation().normalise(7, ctx(7, 7))).toBe(0);
  });

  it('N3 — LogScale floors a negative growth delta at zero: shrinking is not growth', () => {
    const s = new LogScaleNormalisation();
    expect(s.normalise(-5, ctx(0, 40))).toBe(0);
    expect(s.normalise(40, ctx(0, 40))).toBeCloseTo(1);
  });

  it('N4 — LogScale compresses the long tail: doubling the delta does not double the driver', () => {
    const s = new LogScaleNormalisation();
    const ten = s.normalise(10, ctx(0, 100));
    const twenty = s.normalise(20, ctx(0, 100));
    expect(twenty).toBeGreaterThan(ten);
    expect(twenty).toBeLessThan(ten * 2);
  });

  it('N5 — CappedLinear saturates at the cap rather than letting rainfall dominate', () => {
    const s = new CappedLinearNormalisation();
    expect(s.normalise(0, ctx(0, 200))).toBe(0);
    expect(s.normalise(25, ctx(0, 200))).toBeCloseTo(0.5);
    expect(s.normalise(50, ctx(0, 200))).toBe(1);
    expect(s.normalise(200, ctx(0, 200))).toBe(1);
  });

  it('N6 — RecencyDecay rises with days untreated and is 0 immediately after treatment (4.1.17)', () => {
    const s = new RecencyDecayNormalisation();
    expect(s.normalise(0, ctx(0, 365))).toBe(0);
    expect(s.normalise(30, ctx(0, 365))).toBeCloseTo(0.5);
    expect(s.normalise(60, ctx(0, 365))).toBe(1);
    // 4.1.16: a cluster with no treatment record defaults to 90 days, which saturates.
    expect(s.normalise(90, ctx(0, 365))).toBe(1);
  });

  it('N7 — RecencyDecay is monotonic, which is what makes 4.1.17 hold', () => {
    const s = new RecencyDecayNormalisation();
    // A verified treatment resets days-since-treatment to 0. If this driver were not monotonic,
    // the score after treatment could exceed the score before it.
    expect(s.normalise(0, ctx(0, 365))).toBeLessThan(s.normalise(45, ctx(0, 365)));
  });

  it('N8 — PremisesMix passes the 1.1.15 value through untransformed (4.1.21)', () => {
    const s = new PremisesMixNormalisation();
    expect(s.normalise(0.42, ctx(0, 1))).toBe(0.42);
    expect(s.normalise(0, ctx(0, 1))).toBe(0);
    expect(s.normalise(1, ctx(0, 1))).toBe(1);
  });

  it('N9 — PremisesMix throws on an out-of-range input instead of hiding an upstream defect', () => {
    const s = new PremisesMixNormalisation();
    expect(() => s.normalise(1.5, ctx(0, 1))).toThrow(/outside \[0, 1\]/);
    expect(() => s.normalise(-0.1, ctx(0, 1))).toThrow();
  });

  it('N10 — every strategy reports the driver it normalises (4.1.3)', () => {
    expect(new MinMaxNormalisation().driver()).toBe(Driver.CaseSize);
    expect(new LogScaleNormalisation().driver()).toBe(Driver.CaseGrowthDelta);
    expect(new CappedLinearNormalisation().driver()).toBe(Driver.Rainfall24h);
    expect(new RecencyDecayNormalisation().driver()).toBe(Driver.DaysSinceLastTreatment);
    expect(new PremisesMixNormalisation().driver()).toBe(Driver.PremisesMix);
  });
});

/**
 * §2.4 — ConfigSet.validate. 4.1.6 rejects a weight configuration that does not sum to 1.0.
 * Classes: sums below 1, exactly 1, above 1, and the empty configuration.
 */
describe('EC/BV: weight configuration is rejected unless it sums to 1.0 (4.1.6)', () => {
  function config(weights: [Driver, number][], high = 70, medium = 40): ConfigSet {
    const c = new ConfigSet();
    Object.assign(c, { tierThresholds: new TierThresholds(high, medium) });
    weights.forEach(([d, w]) => c.driverWeights.set(d, w));
    return c;
  }

  it('W1 — a configuration summing to exactly 1.0 is accepted', () => {
    expect(() =>
      config([
        [Driver.CaseSize, 0.5],
        [Driver.Rainfall24h, 0.5],
      ]).validate(),
    ).not.toThrow();
  });

  it('W2 — a configuration summing below 1.0 is rejected', () => {
    expect(() => config([[Driver.CaseSize, 0.9]]).validate()).toThrow(/sum to 1.0/);
  });

  it('W3 — a configuration summing above 1.0 is rejected', () => {
    expect(() =>
      config([
        [Driver.CaseSize, 0.7],
        [Driver.Rainfall24h, 0.7],
      ]).validate(),
    ).toThrow(/sum to 1.0/);
  });

  it('W4 — an empty configuration is rejected, not treated as valid (4.1.5)', () => {
    expect(() => config([]).validate()).toThrow(/no driver weights/);
  });

  it('W5 — floating-point addition of seven realistic weights is still accepted', () => {
    // The boundary case that matters in practice: 0.1 + 0.2 !== 0.3 in binary floating point, so a
    // strict equality check would reject a configuration that is correct.
    expect(() =>
      config([
        [Driver.CaseSize, 0.3],
        [Driver.CaseGrowthDelta, 0.2],
        [Driver.Rainfall24h, 0.15],
        [Driver.Rainfall72h, 0.1],
        [Driver.VerifiedOpenReportCount, 0.1],
        [Driver.DaysSinceLastTreatment, 0.1],
        [Driver.PremisesMix, 0.05],
      ]).validate(),
    ).not.toThrow();
  });

  it('W6 — thresholds that cross are rejected', () => {
    expect(() => config([[Driver.CaseSize, 1.0]], 40, 70).validate()).toThrow(/medium < high/);
  });
});
