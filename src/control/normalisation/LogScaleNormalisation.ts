/**
 * D-Fence — LogScaleNormalisation.
 * Log scale. Growth deltas are long-tailed: one cluster jumping by 40 cases must not flatten every other cluster to nearly zero.
 * Traces: 4.1.4.
 */
import { Driver } from '../../entity/enums';
import { NormalisationContext, NormalisationStrategy, clamp01 } from './NormalisationStrategy';

export class LogScaleNormalisation implements NormalisationStrategy {
  driver(): Driver {
    return Driver.CaseGrowthDelta;
  }

  normalise(raw: number, ctx: NormalisationContext): number {
    // Growth deltas are long-tailed: one cluster jumping 40 cases must not flatten the rest.
    // Negative deltas (a shrinking cluster) are not growth, so they floor at zero.
    const scaled = Math.log1p(Math.max(0, raw));
    const ceiling = Math.log1p(Math.max(0, ctx.observedMax));
    return ceiling <= 0 ? 0 : clamp01(scaled / ceiling);
  }
}
