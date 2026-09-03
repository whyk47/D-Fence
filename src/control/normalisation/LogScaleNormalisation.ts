/**
 * D-Fence — LogScaleNormalisation.
 * Log scale. Both case size and case growth delta are long-tailed: one cluster of 258 cases must
 * not flatten eleven others to nearly zero.
 * Traces: 4.1.4, 4.1.11. Evidence and parameters in SCORING-SPEC.md §2.1.
 *
 * **Scores must be comparable across days.** Normalising against the *observed* maximum makes them
 * comparable only within one cycle: the same 61-case cluster would score differently tomorrow merely
 * because a larger cluster appeared or closed, and 4.1.11 keeps scores as history while 4.1.17
 * compares them across cycles. So the ceiling is a **fixed reference** by default, and the observed
 * maximum is used only when no reference is configured. This closes open point 4 carried out of
 * `EPICS-STORIES.md`, which flagged the same trap for min-max.
 */
import { Driver } from '../../entity/enums';
import { NormalisationContext, NormalisationStrategy, clamp01 } from './NormalisationStrategy';

export class LogScaleNormalisation implements NormalisationStrategy {
  /**
   * @param target the driver this instance normalises. Two drivers share this method — case size
   *   and case growth delta — so the binding is a parameter.
   * @param referenceMax the fixed ceiling this driver saturates at, in the driver's own units.
   *   Omit it to fall back to the observed maximum, which is comparable within a cycle but not
   *   across days; the factory always supplies one.
   */
  constructor(
    private readonly target: Driver = Driver.CaseGrowthDelta,
    private readonly referenceMax?: number,
  ) {
    if (referenceMax !== undefined && !(referenceMax > 0)) {
      throw new Error(`referenceMax must be positive, got ${referenceMax}`);
    }
  }

  driver(): Driver {
    return this.target;
  }

  /** @returns the fixed ceiling, or undefined when this instance falls back to the observed range. */
  reference(): number | undefined {
    return this.referenceMax;
  }

  normalise(raw: number, ctx: NormalisationContext): number {
    // Long-tailed: on the 2026-09-03 payload a linear scale put a 61-case cluster at 0.230 against
    // a 258-case maximum, which stops the driver discriminating where it matters. Negative values
    // (a shrinking cluster) are not growth, so they floor at zero.
    const ceilingValue = this.referenceMax ?? Math.max(0, ctx.observedMax);
    const scaled = Math.log1p(Math.max(0, raw));
    const ceiling = Math.log1p(ceilingValue);
    return ceiling <= 0 ? 0 : clamp01(scaled / ceiling);
  }
}
