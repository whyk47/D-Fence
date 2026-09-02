/**
 * D-Fence — the four §11.4 sub-states, as one value.
 * Traces: 11.4.x, 10.2.2, 10.5.7.
 *
 * A discriminated union rather than four booleans: "loading and error and stale" is not a state
 * this system has, and a type that cannot represent it cannot render it.
 */
export type LoadState =
  | { kind: 'loading' }
  | { kind: 'empty'; message: string }
  | { kind: 'error'; cause: string; remedy: string }
  | { kind: 'stale'; asOf: Date }
  | { kind: 'ready' };
