/**
 * D-Fence — RecencyDecayNormalisation.
 * Rises with days since treatment and resets on a new treatment record. This is what makes 4.1.17
 * true — the score after a verified treatment must be lower than before it.
 * Traces: 4.1.4. Parameter justified in SCORING-SPEC.md §2.3.
 */
import { Driver } from '../../entity/enums';
import { NormalisationContext, NormalisationStrategy, clamp01 } from './NormalisationStrategy';

export class RecencyDecayNormalisation implements NormalisationStrategy {
  /**
   * @param saturationDays beyond this, "not treated recently" stops discriminating between
   *   clusters. Note the interaction with 4.1.16: an untreated cluster defaults to 90 days and so
   *   enters already saturated at 1.0, which is intended — never-treated is this driver's worst case.
   */
  constructor(private readonly saturationDays: number = 60) {
    if (!(saturationDays > 0)) {
      throw new Error(`saturationDays must be positive, got ${saturationDays}`);
    }
  }

  driver(): Driver {
    return Driver.DaysSinceLastTreatment;
  }

  saturation(): number {
    return this.saturationDays;
  }

  normalise(raw: number, _ctx: NormalisationContext): number {
    // Rises with days since the last treatment and resets when a new TreatmentRecord is written.
    // This is what makes 4.1.17 true: the score after a verified treatment must be lower than the
    // score before it, and this is the driver that moves.
    return clamp01(Math.max(0, raw) / this.saturationDays);
  }
}
