/**
 * D-Fence — LogScaleNormalisation.
 * Log scale. Growth deltas are long-tailed: one cluster jumping by 40 cases must not flatten every other cluster to nearly zero.
 * Traces: 4.1.4.
 */
import { Driver } from '../../entity/enums';
import { NormalisationContext, NormalisationStrategy } from './NormalisationStrategy';

export class LogScaleNormalisation implements NormalisationStrategy {
  driver(): Driver {
    return Driver.CaseGrowthDelta;
  }

  normalise(_raw: number, _ctx: NormalisationContext): number {
    // TODO(F5)
    throw new Error('not implemented');
  }
}
