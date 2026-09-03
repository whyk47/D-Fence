/**
 * D-Fence — MinMaxNormalisation.
 * Linear against the observed range across active clusters.
 *
 * **Not currently bound to any driver.** It was case size until the 2026-09-03 payload showed the
 * distribution is long-tailed (258 cases against a mode of 2), where min-max lets one outlier define
 * the scale and collapses every other cluster into the bottom quarter — see SCORING-SPEC.md §2.1.
 * It is retained in the Strategy family because it is the right method for a bounded, evenly spread
 * driver, and rebinding it is one line in NormalisationFactory.
 *
 * Traces: 4.1.4.
 */
import { Driver } from '../../entity/enums';
import { NormalisationContext, NormalisationStrategy, clamp01 } from './NormalisationStrategy';

export class MinMaxNormalisation implements NormalisationStrategy {
  constructor(private readonly target: Driver = Driver.CaseSize) {}

  driver(): Driver {
    return this.target;
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
