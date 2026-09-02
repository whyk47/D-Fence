/**
 * D-Fence — RecencyDecayNormalisation.
 * Rises with days since treatment and resets on a new treatment record. This is what makes 4.1.17 true — the score after a verified treatment must be lower than before it.
 * Traces: 4.1.4.
 */
import { Driver } from '../../entity/enums';
import { NormalisationContext, NormalisationStrategy } from './NormalisationStrategy';

export class RecencyDecayNormalisation implements NormalisationStrategy {
  driver(): Driver {
    return Driver.DaysSinceLastTreatment;
  }

  normalise(_raw: number, _ctx: NormalisationContext): number {
    // TODO(F5)
    throw new Error('not implemented');
  }
}
