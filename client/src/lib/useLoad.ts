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
  /** When the screen last received an answer from the server, or null before the first one. */
  lastLoadedAt: Date | null;
}

export function useLoad<T>(
  api: ApiClient,
  path: string,
  options: {
    isEmpty?: (value: T) => boolean;
    emptyMessage?: string;
    /**
     * Re-fetch every this many milliseconds, so one user's action becomes visible to another
     * without a reload.
     *
     * Omitted, the screen loads once, which is right for a form or a detail the user is reading.
     * Given, the screen is a shared queue: a manager assigns a job and the crew member holding
     * their phone should see it, and a crew member completes one and the manager's list should
     * stop showing it as outstanding. The alternative that was shipped is "press F5", which — until
     * `SessionPersistence` landed — also signed them out.
     *
     * Not a WebSocket or an EventSource. Both would need a second server-side channel and a
     * reconnection policy for a screen whose data changes a few times an hour, and 10.1's budget
     * is a p95 on a B1 instance shared with the ingestion cycle.
     */
    refreshMs?: number;
  } = {},
): Loaded<T> {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [value, setValue] = useState<T | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const refreshMs = options.refreshMs ?? 0;

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
      setLastLoadedAt(new Date());
    });
    return () => {
      live = false;
    };
    // `attempt` is the retry trigger: incrementing it re-runs the effect with the same path.
  }, [api, path, attempt]);

  /**
   * The poll, kept deliberately separate from the effect above.
   *
   * It does **not** go through `setAttempt`, and that is the whole design. Re-running the first
   * effect would set `loading` on every tick, so a queue on a twenty-second poll would blank
   * itself three times a minute while the user was reading it — a refresh that destroys the thing
   * it is refreshing. This writes the new value in underneath instead, and the screen only changes
   * where the data changed.
   *
   * Three further rules, each of which is a real failure rather than a precaution:
   *
   * - **A failed tick is discarded, not shown.** The screen is already displaying good data. One
   *   dropped request replacing a working queue with an error page would be strictly worse than
   *   the stale row it was trying to correct; the next tick will either succeed or the user will
   *   press something and get the error honestly.
   * - **Nothing is polled while the tab is hidden.** A phone in a pocket is the normal state of a
   *   crew member's device, and a background tab polling all afternoon spends their battery and
   *   the B1's request budget on frames nobody sees.
   * - **A tab that becomes visible again re-fetches immediately** rather than waiting out the rest
   *   of its interval, because the moment the user looks back at the screen is exactly the moment
   *   a stale row matters.
   */
  useEffect(() => {
    if (refreshMs <= 0) {
      return undefined;
    }
    let live = true;
    let inFlight = false;

    const tick = (): void => {
      // `inFlight` matters on a slow connection: without it a request that takes longer than the
      // interval starts a second one, and then a third, until the queue of them outruns the tab.
      if (!live || inFlight || document.visibilityState === 'hidden') {
        return;
      }
      inFlight = true;
      void api
        .load<T>(path, optionsRef.current.isEmpty, optionsRef.current.emptyMessage)
        .then((result) => {
          if (!live || result.state.kind === 'error') {
            return;
          }
          setState(result.state);
          setValue(result.value);
          setLastLoadedAt(new Date());
        })
        .finally(() => {
          inFlight = false;
        });
    };

    const timer = setInterval(tick, refreshMs);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [api, path, refreshMs]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, value, retry, lastLoadedAt };
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
