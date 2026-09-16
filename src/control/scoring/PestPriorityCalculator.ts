/**
 * D-Fence — the priority score: severity × urgency.
 * Stereotype: <<control>>. Traces: 4.1.1, 4.1.7, 4.1.8, 4.1.9, 4.1.11, 4.1.14, 4.2.4, 4.2.5, 4.2.8,
 * 4.3.9, 4.4.3-4.4.6.
 *
 *   PestPriority(locality, pest, t) = 100 × σ(pest) × U(locality, pest, t)
 *
 * σ comes from the pest profile and is fixed; U comes from `UrgencyCalculator` and moves hourly.
 *
 * **4.2.5 is the requirement this class exists to satisfy.** σ(Mosquito) is 1.000 by construction —
 * the multipliers are normalised against the most severe pest in the catalogue and 4.2.7 refuses a
 * catalogue where none is 1.0 — and the tier A weight set is v0.8's, unchanged. So for the mosquito
 * this is `100 × 1 × (v0.8 weighted sum)`, which is the v0.8 score exactly, not approximately.
 */
import { EvidenceTier, PestType, PriorityTier } from '../../entity/enums';
import { Uuid } from '../../entity/valueTypes';
import { PriorityScore } from '../../entity/PriorityScore';
import { PestProfile } from '../../entity/PestProfile';
import { TierThresholds } from '../../entity/valueTypes';
import { NormalisationContext } from '../normalisation/NormalisationStrategy';
import { DriverInputs, UrgencyCalculator } from './UrgencyCalculator';

/**
 * What is being scored (4.1.1 as revised): a locality and a pest type, not a cluster. `clusterId` is
 * present only for the mosquito, which is the one pest with a government feed and therefore the one
 * pest whose subject is also a cluster.
 */
export interface ScoredSubject {
  readonly localityId: Uuid;
  readonly locality: string;
  readonly pestType: PestType;
  readonly clusterId?: Uuid;
}

/** 4.4.3 — the outcome of the override evaluation for one subject, if any matched. */
export interface OverrideOutcome {
  readonly ruleNames: string[];
}

export class PestPriorityCalculator {
  constructor(
    private readonly urgencies: UrgencyCalculator,
    private readonly thresholds: TierThresholds,
  ) {}

  /**
   * 4.2.4 — the priority score, 0-100 to one decimal place.
   *
   * The rounding is part of the requirement, not presentation: 4.1.7 said one decimal place and
   * 4.2.4 repeats it, and rounding here rather than in the UI means the stored score and the
   * displayed score are the same number — which matters because 4.1.11 keeps the score as history
   * and 4.1.17 compares scores across cycles.
   */
  applySeverity(urgency: number, profile: PestProfile): number {
    return Math.round(profile.severityMultiplier * urgency * 1000) / 10;
  }

  /**
   * 4.1.8: High at 70.0 or above, Medium from 40.0 to 69.9, Low below 40.0. The thresholds come
   * from configuration (4.1.9), not from constants here.
   *
   * A score exactly on a threshold takes the HIGHER tier. Stated because it is a decision, not an
   * accident of comparison operators: 70.0 is High and 40.0 is Medium, and the Lab 4 boundary-value
   * cases are 39.9 / 40.0 / 40.1 and 69.9 / 70.0 / 70.1.
   *
   * Critical is not reachable from here. 4.4.3 assigns it irrespective of score, so it is applied by
   * `withOverride` after this method has had its say — and `withOverride` keeps the score this
   * method's tier was derived from (4.4.5).
   */
  assignTier(score: number): PriorityTier {
    if (score >= this.thresholds.high) {
      return PriorityTier.High;
    }
    if (score >= this.thresholds.medium) {
      return PriorityTier.Medium;
    }
    return PriorityTier.Low;
  }

  /** The whole computation for one subject. */
  score(
    subject: ScoredSubject,
    profile: PestProfile,
    inputs: DriverInputs,
    ctx: NormalisationContext,
  ): PriorityScore {
    if (profile.pestType !== subject.pestType) {
      throw new Error(
        `profile for ${profile.pestType} used to score ${subject.pestType} (4.2.3)`,
      );
    }
    const urgency = this.urgencies.computeUrgency(profile, inputs, ctx);

    const out = new PriorityScore();
    out.localityId = subject.localityId;
    out.clusterId = subject.clusterId ?? subject.localityId;
    out.pestType = subject.pestType;
    out.computedAt = ctx.now;
    out.urgency = urgency.urgency;
    out.severityMultiplier = profile.severityMultiplier;
    out.evidenceTier = profile.evidenceTier;
    out.score = this.applySeverity(urgency.urgency, profile);
    out.tier = this.assignTier(out.score);
    out.excludedDrivers = urgency.excludedDrivers;
    out.isDegraded = urgency.excludedDrivers.length > 0;
    out.rank = 0;
    out.contributions = urgency.contributions;
    return out;
  }

  /**
   * 4.4.3-4.4.6 — raise a subject to Critical without touching its score.
   *
   * The score is retained deliberately (4.4.5). Raising the *score* to 100 would put the case at the
   * top of the table and would also tell every downstream reader that the evidence is overwhelming,
   * which it is not: a snake indoors is usually a single report. The tier says "dangerous"; the
   * score still says "one report". Both are true and the manager needs both.
   */
  withOverride(score: PriorityScore, outcome: OverrideOutcome): PriorityScore {
    if (outcome.ruleNames.length === 0) {
      return score;
    }
    score.tier = PriorityTier.Critical;
    score.overrideRuleName = outcome.ruleNames.join(', ');
    return score;
  }

  /** 4.3.9 / 4.2.8 — what the table shows beside the number. */
  static describe(score: PriorityScore): string {
    const tier: EvidenceTier | undefined = score.evidenceTier;
    return `${score.score.toFixed(1)} (${score.tier}, evidence tier ${tier ?? '?'}, ` +
      `severity ${score.severityMultiplier?.toFixed(2) ?? '?'})`;
  }
}
