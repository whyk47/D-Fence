/**
 * D-Fence — RecencyDecayNormalisation.
 * Rises with days since treatment and resets on a new treatment record. This is what makes 4.1.17 true — the score after a verified treatment must be lower than before it.
 * Traces: 4.1.4.
 */
import { Driver } from '../../entity/enums';
import { NormalisationContext, NormalisationStrategy, clamp01 } from './NormalisationStrategy';

export class RecencyDecayNormalisation implements NormalisationStrategy {
  driver(): Driver {
    return Driver.DaysSinceLastTreatment;
  }

  /** Beyond this, "not treated recently" stops discriminating between clusters. */
  private static readonly SATURATION_DAYS = 60;

  normalise(raw: number, _ctx: NormalisationContext): number {
    // Rises with days since the last treatment and resets when a new TreatmentRecord is
    // written. This is what makes 4.1.17 true: the score after a verified treatment must be
    // lower than the score before it, and this is the driver that moves.
    return clamp01(Math.max(0, raw) / RecencyDecayNormalisation.SATURATION_DAYS);
  }
}
