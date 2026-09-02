/**
 * D-Fence — CappedLinearNormalisation.
 * Linear to a cap, then 1.0. Above the cap more rain does not mean more breeding risk, so the driver saturates instead of dominating the weighted sum.
 * Traces: 4.1.4.
 */
import { Driver } from '../../entity/enums';
import { NormalisationContext, NormalisationStrategy } from './NormalisationStrategy';

export class CappedLinearNormalisation implements NormalisationStrategy {
  driver(): Driver {
    return Driver.Rainfall24h;
  }

  normalise(_raw: number, _ctx: NormalisationContext): number {
    // TODO(F5)
    throw new Error('not implemented');
  }
}
