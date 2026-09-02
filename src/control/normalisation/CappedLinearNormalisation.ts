/**
 * D-Fence — CappedLinearNormalisation.
 * Linear to a cap, then 1.0. Above the cap more rain does not mean more breeding risk, so the driver saturates instead of dominating the weighted sum.
 * Traces: 4.1.4.
 */
import { Driver } from '../../entity/enums';
import { NormalisationContext, NormalisationStrategy, clamp01 } from './NormalisationStrategy';

export class CappedLinearNormalisation implements NormalisationStrategy {
  driver(): Driver {
    return Driver.Rainfall24h;
  }

  /** Above the cap, more rain does not mean more breeding risk — the driver saturates. */
  private static readonly CAP_MM = 50;

  normalise(raw: number, _ctx: NormalisationContext): number {
    return clamp01(Math.max(0, raw) / CappedLinearNormalisation.CAP_MM);
  }
}
