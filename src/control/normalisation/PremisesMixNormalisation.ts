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

  /**
   * 4.1.21 is explicit: use the value computed by 1.1.15 **without further transformation**. So
   * this strategy deliberately does nothing but check the contract — construction sites and public
   * places already carry more weight per premises than homes, and applying a second curve here
   * would double-count that judgement.
   *
   * An out-of-range value is a defect upstream in 1.1.15, so it throws rather than clamping: a
   * silent clamp would hide the bug and produce a plausible-looking score.
   */
  normalise(raw: number, _ctx: NormalisationContext): number {
    if (raw < 0 || raw > 1 || Number.isNaN(raw)) {
      throw new Error(`premises mix ${raw} is outside [0, 1]; 1.1.15 must produce a normalised value`);
    }
    return raw;
  }
}
