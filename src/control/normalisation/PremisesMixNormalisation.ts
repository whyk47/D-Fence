/**
 * D-Fence — PremisesMixNormalisation.
 * Weighted by premises kind rather than by count: construction sites and public places carry more breeding risk per premises than homes.
 * Traces: 4.1.4.
 */
import { Driver } from '../../entity/enums';
import { NormalisationContext, NormalisationStrategy } from './NormalisationStrategy';

export class PremisesMixNormalisation implements NormalisationStrategy {
  driver(): Driver {
    return Driver.PremisesMix;
  }

  normalise(_raw: number, _ctx: NormalisationContext): number {
    // TODO(F5)
    throw new Error('not implemented');
  }
}
