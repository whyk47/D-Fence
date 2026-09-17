/**
 * D-Fence — entity class `PriorityScore`
 * Stereotype: <<entity>>. Traces: 4.1.7, 4.1.8, 4.1.10, 4.1.11, 4.1.13, 4.1.18, 4.1.20,
 * 4.2.4, 4.2.8, 4.3.9, 4.4.5, 4.4.6
 */

import { Uuid } from './valueTypes';
import { PriorityTier, Driver, EvidenceTier, PestType } from './enums';
import { DriverContribution } from './DriverContribution';

export class PriorityScore {
  id!: Uuid;
  /**
   * 4.1.1 as revised — the scored subject is a locality and a pest type. `clusterId` is retained
   * and, for the mosquito, still carries the cluster: it is the only pest whose subject is also a
   * cluster, and every v0.8 reader of this field keeps working.
   */
  clusterId!: Uuid;
  localityId!: Uuid;
  pestType: PestType = PestType.Mosquito;
  computedAt!: Date;
  /** 4.1.7 as revised — the weighted sum, in [0, 1], before severity is applied. */
  urgency!: number;
  /** 4.2.8 — shown beside the score whenever one pest's row sits next to another's. */
  severityMultiplier!: number;
  /**
   * 4.3.9 — shown beside the score, because a tier C number is a weaker claim than a tier A one.
   *
   * Optional, and `undefined` is a real state rather than a gap: a score loaded from a row written
   * before migration 007 has no stored tier, and `describe` renders "?" for it. Defaulting such a
   * row to A would present the strongest evidence claim the system can make about a score whose
   * evidence is in fact unknown.
   */
  evidenceTier: EvidenceTier | undefined = EvidenceTier.A;
  /** 4.2.4 — 100 x severity x urgency, to one decimal place. */
  score!: number;
  tier!: PriorityTier;
  /** 4.4.6 — the override rule that raised this to Critical, or empty. */
  overrideRuleName = '';
  /** 4.1.13 — true when any driver was excluded under 4.1.12. */
  isDegraded!: boolean;
  excludedDrivers: Driver[] = [];
  rank!: number;

  /**
   * The contributions, stored rather than recomputed (4.1.10). Seven for a tier A subject, six for
   * tier B, five for tier C (4.3.4-4.3.6), and fewer still when the score is degraded — the
   * excluded drivers are named in `excludedDrivers`, not represented by a zero.
   */
  contributions: DriverContribution[] = [];

  /** 4.4.3 — Critical is assigned by the override evaluator, never by a threshold. */
  isCritical(): boolean {
    return this.tier === PriorityTier.Critical;
  }

  breakdown(): DriverContribution[] {
    return [...this.contributions].sort((a, b) => b.contribution - a.contribution);
  }

  /**
   * Human-readable justification shown on Cluster Detail (4.1.18, 9.x).
   * Names the two largest contributors, because "why is this cluster top?" is answered by what
   * pushed it there, not by a list of seven numbers the reader has to rank themselves.
   */
  explain(): string {
    const top = this.breakdown().slice(0, 2);
    if (top.length === 0) {
      return `Score ${this.score.toFixed(1)} (${this.tier}); no driver data was available.`;
    }
    const parts = top.map(
      (c) => `${c.driver} ${c.normalisedValue.toFixed(2)} × weight ${c.weight.toFixed(2)}`,
    );
    const degraded =
      this.excludedDrivers.length === 0
        ? ''
        : ` Degraded — excluded: ${this.excludedDrivers.join(', ')}.`;
    // 4.4.6 — a Critical row must say what made it critical, or the tier is unexplained.
    const override = this.overrideRuleName === '' ? '' : ` Critical: ${this.overrideRuleName}.`;
    return `Score ${this.score.toFixed(1)} (${this.tier}), led by ${parts.join(' and ')}.${override}${degraded}`;
  }
}
