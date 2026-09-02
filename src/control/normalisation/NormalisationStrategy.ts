/**
 * D-Fence — driver normalisation (Strategy).
 * Traces: 4.1.4. Requirement 4.1.4 obliges a normalisation method per driver and names none —
 * open item 1 carried out of Lab 2 and closed here as a design decision. Each driver gets a
 * strategy, so a change of method is one class, not an edit inside the scoring engine.
 */
import { Driver } from '../../entity/enums';

/** Whatever a strategy needs beyond the raw value: population extremes, a clock, a cap. */
export interface NormalisationContext {
  readonly observedMin: number;
  readonly observedMax: number;
  readonly now: Date;
}

/**
 * Every strategy returns a value on [0, 1]. A driver outside that range is a defect, not a large
 * driver: the weighted sum in 4.1.6 assumes normalised inputs, so one runaway driver would silently
 * outvote the other six.
 */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    throw new Error('normalisation produced NaN');
  }
  return Math.min(1, Math.max(0, value));
}

export interface NormalisationStrategy {
  /** @returns a value in [0, 1]. Anything outside that range is a defect, not a large driver. */
  normalise(raw: number, ctx: NormalisationContext): number;
  driver(): Driver;
}
