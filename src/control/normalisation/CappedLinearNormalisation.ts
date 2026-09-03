/**
 * D-Fence — CappedLinearNormalisation.
 * Linear to a cap, then 1.0. Above the cap more of the raw quantity does not mean more breeding
 * risk, so the driver saturates instead of dominating the weighted sum.
 * Traces: 4.1.4. Methods and parameters are justified in SCORING-SPEC.md §2.
 */
import { Driver } from '../../entity/enums';
import { NormalisationContext, NormalisationStrategy, clamp01 } from './NormalisationStrategy';

export class CappedLinearNormalisation implements NormalisationStrategy {
  /**
   * @param target the driver this instance normalises — three drivers share this method with
   *   different caps (24 h rainfall, 72 h rainfall, verified open report count), so the driver and
   *   the cap are constructor parameters rather than constants. Defaults preserve the original
   *   24-hour-rainfall binding.
   * @param capValue the value at which the driver saturates, in the driver's own units
   */
  constructor(
    private readonly target: Driver = Driver.Rainfall24h,
    private readonly capValue: number = CappedLinearNormalisation.DEFAULT_CAP_MM,
  ) {
    if (!(capValue > 0)) {
      throw new Error(`cap must be positive, got ${capValue}`);
    }
  }

  /** Above the cap, more rain does not mean more breeding risk — it means run-off. */
  private static readonly DEFAULT_CAP_MM = 50;

  driver(): Driver {
    return this.target;
  }

  cap(): number {
    return this.capValue;
  }

  normalise(raw: number, _ctx: NormalisationContext): number {
    return clamp01(Math.max(0, raw) / this.capValue);
  }
}
