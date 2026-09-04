/**
 * D-Fence — a GET as a `LoadState`, for screens.
 * Traces: 11.4.1–11.4.4, 10.2.2, 10.5.7.
 *
 * `ApiClient.load` already turns a fetch into a state; this adds the three things a *screen* needs
 * and a plain call cannot give it: the initial `loading` render, a `retry` for 11.4.4, and the
 * guard against a response arriving after the user has navigated away.
 *
 * That last one is not defensive padding. Without it, a slow request from a screen the user has
 * left calls `setState` on an unmounted component, and — worse than the warning — the *previous*
 * screen's data can land in the current one when two requests race.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClient } from './ApiClient';
import { LoadState } from './LoadState';

export interface Loaded<T> {
  state: LoadState;
  value: T | null;
  /** 11.4.4 — every error state offers this. */
  retry: () => void;
}

export function useLoad<T>(
  api: ApiClient,
  path: string,
  options: { isEmpty?: (value: T) => boolean; emptyMessage?: string } = {},
): Loaded<T> {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [value, setValue] = useState<T | null>(null);
  const [attempt, setAttempt] = useState(0);

  /**
   * The options are held in a ref rather than named as dependencies, and this is not a style
   * preference — it is the difference between working and not.
   *
   * Every screen passes `isEmpty` as an inline lambda, which is a new function identity on every
   * render. Naming it as a dependency therefore re-runs the effect on every render, and since the
   * effect sets state, each run causes the next: an unbounded fetch loop that hammers the server
   * and exhausts the heap. A ref keeps the *latest* callback available without making the effect
   * depend on its identity.
   */
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let live = true;
    setState({ kind: 'loading' });
    void api.load<T>(path, optionsRef.current.isEmpty, optionsRef.current.emptyMessage).then((result) => {
      if (!live) {
        return;
      }
      setState(result.state);
      setValue(result.value);
    });
    return () => {
      live = false;
    };
    // `attempt` is the retry trigger: incrementing it re-runs the effect with the same path.
  }, [api, path, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, value, retry };
}

/**
 * 10.2.2, 10.5.7 — degraded data is shown, marked as of when it was true.
 *
 * A screen calls this on a payload that carries its own freshness stamp. The `stale` state renders
 * the data *and* the notice, so a stale source degrades the screen rather than emptying it.
 */
export function staleIfOlderThan(state: LoadState, asOf: Date | null, maxAgeMs: number, now = new Date()): LoadState {
  if (state.kind !== 'ready' || asOf === null) {
    return state;
  }
  return now.getTime() - asOf.getTime() > maxAgeMs ? { kind: 'stale', asOf } : state;
}
