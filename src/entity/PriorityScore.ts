/**
 * D-Fence — entity class `PriorityScore`
 * Stereotype: <<entity>>. Traces: 4.1.7, 4.1.8, 4.1.10, 4.1.11, 4.1.13, 4.1.18, 4.1.20
 */

import { Uuid } from './valueTypes';
import { PriorityTier, Driver } from './enums';
import { DriverContribution } from './DriverContribution';

export class PriorityScore {
  id!: Uuid;
  clusterId!: Uuid;
  computedAt!: Date;
  score!: number;
  tier!: PriorityTier;
  /** 4.1.13 — true when any driver was excluded under 4.1.12. */
  isDegraded!: boolean;
  excludedDrivers: Driver[] = [];
  rank!: number;

  /**
   * The contributions, stored rather than recomputed (4.1.10). Fewer than seven when the score is
   * degraded — the excluded drivers are named in `excludedDrivers`, not represented by a zero.
   */
  contributions: DriverContribution[] = [];

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
    return `Score ${this.score.toFixed(1)} (${this.tier}), led by ${parts.join(' and ')}.${degraded}`;
  }
}
