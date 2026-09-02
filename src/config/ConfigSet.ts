/**
 * D-Fence — runtime configuration.
 * Traces: 10.6.2 (weights and thresholds outside the code), 10.3.4 (secrets outside the repo).
 */
import { Driver, SourceKind } from '../entity/enums';
import { TierThresholds } from '../entity/valueTypes';

export class ConfigSet {
  /** 4.1.5. Values are a team decision to be made against real data, not invented here. */
  readonly driverWeights = new Map<Driver, number>();
  /** 4.1.x tier cut-offs; the Lab 4 boundary-value cases sit exactly on these. */
  readonly tierThresholds!: TierThresholds;
  /** rainfall 5 min, clusters hourly, forecast 6 h, OneMap token 48 h. */
  readonly ingestionIntervals = new Map<SourceKind, number>();

  get(_key: string): string {
    throw new Error('not implemented');
  }

  /** Throws rather than defaulting: a mis-set weight must fail loudly at startup. */
  requireNumber(_key: string): number {
    throw new Error('not implemented');
  }

  /**
   * 4.1.6: the weights must sum to 1.0. Checked at load rather than at scoring time, because a
   * mis-set weight that is only noticed during a scoring cycle has already produced wrong output.
   * The tolerance is for floating-point addition, not for sloppy configuration.
   */
  validate(): void {
    const weights = [...this.driverWeights.values()];
    if (weights.length === 0) {
      throw new Error('no driver weights configured (4.1.5)');
    }
    const sum = weights.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-9) {
      throw new Error(`driver weights sum to ${sum}, must sum to 1.0 (4.1.6)`);
    }
    if (this.tierThresholds.medium >= this.tierThresholds.high) {
      throw new Error('tier thresholds must satisfy medium < high');
    }
  }
}
