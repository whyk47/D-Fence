/**
 * D-Fence — MinMaxNormalisation.
 * Linear against the observed range across active clusters. Suits case size, where the population is bounded and comparison between clusters is the point.
 * Traces: 4.1.4.
 */
import { Driver } from '../../entity/enums';
import { NormalisationContext, NormalisationStrategy } from './NormalisationStrategy';

export class MinMaxNormalisation implements NormalisationStrategy {
  driver(): Driver {
    return Driver.CaseSize;
  }

  normalise(_raw: number, _ctx: NormalisationContext): number {
    // TODO(F5)
    throw new Error('not implemented');
  }
}
