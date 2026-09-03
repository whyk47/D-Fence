/**
 * D-Fence — LogScaleNormalisation.
 * Log scale against the observed maximum. Both case size and case growth delta are long-tailed:
 * one cluster of 258 cases must not flatten eleven others to nearly zero.
 * Traces: 4.1.4. Evidence for choosing this over min-max is in SCORING-SPEC.md §2.1.
 */
import { Driver } from '../../entity/enums';
import { NormalisationContext, NormalisationStrategy, clamp01 } from './NormalisationStrategy';

export class LogScaleNormalisation implements NormalisationStrategy {
  /**
   * @param target the driver this instance normalises. Two drivers share this method — case size
   *   and case growth delta — so the binding is a parameter. The default preserves the original
   *   growth-delta binding.
   */
  constructor(private readonly target: Driver = Driver.CaseGrowthDelta) {}

  driver(): Driver {
    return this.target;
  }

  normalise(raw: number, ctx: NormalisationContext): number {
    // Long-tailed: on the 2026-09-03 payload min-max put a 61-case cluster at 0.23 and a 2-case
    // cluster at 0.00, which stops the driver discriminating where it matters. Negative values
    // (a shrinking cluster) are not growth, so they floor at zero.
    const scaled = Math.log1p(Math.max(0, raw));
    const ceiling = Math.log1p(Math.max(0, ctx.observedMax));
    return ceiling <= 0 ? 0 : clamp01(scaled / ceiling);
  }
}
