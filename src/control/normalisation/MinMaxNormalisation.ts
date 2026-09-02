/**
 * D-Fence — MinMaxNormalisation.
 * Linear against the observed range across active clusters. Suits case size, where the population is bounded and comparison between clusters is the point.
 * Traces: 4.1.4.
 */
import { Driver } from '../../entity/enums';
import { NormalisationContext, NormalisationStrategy, clamp01 } from './NormalisationStrategy';

export class MinMaxNormalisation implements NormalisationStrategy {
  driver(): Driver {
    return Driver.CaseSize;
  }

  normalise(raw: number, ctx: NormalisationContext): number {
    const span = ctx.observedMax - ctx.observedMin;
    if (span <= 0) {
      // Every cluster shares one value, so this driver separates nothing today. Returning 0
      // rather than 0.5 keeps a flat driver from contributing a constant to every score.
      return 0;
    }
    return clamp01((raw - ctx.observedMin) / span);
  }
}
