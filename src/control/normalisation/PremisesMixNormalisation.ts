/**
 * D-Fence — PremisesMixNormalisation.
 * Weighted by premises kind rather than by count: construction sites and public places carry more breeding risk per premises than homes.
 * Traces: 4.1.4.
 */
import { Driver } from '../../entity/enums';
import { NormalisationContext, NormalisationStrategy, clamp01 } from './NormalisationStrategy';

export class PremisesMixNormalisation implements NormalisationStrategy {
  driver(): Driver {
    return Driver.PremisesMix;
  }

  normalise(raw: number, _ctx: NormalisationContext): number {
    // `raw` is the pre-weighted mix score computed by PriorityScoringEngine from PremisesMix:
    // construction sites and public places carry more breeding risk per premises than homes.
    // Already expressed on [0, 1]; clamped here so a bad input cannot dominate the sum.
    return clamp01(raw);
  }
}
