/**
 * D-Fence — the shared loading, empty, error and stale states.
 * Stereotype: <<boundary>>. Traces: 11.4.1–11.4.6, 10.2.2, 10.5.3, 10.5.7.
 *
 * One implementation of each, used by every screen. US-10.2 asks for that so the boundary layer is
 * not rewritten per screen; the sharper reason is 11.4.4 — an error state must offer a retry, and a
 * retry written thirty times is a retry missing from at least one of them.
 */
import { LoadState } from '../lib/LoadState';

export interface StateViewProps {
  state: LoadState;
  /** 11.4.4 — the retry control. Absent only where retrying is meaningless. */
  onRetry?: () => void;
  children?: React.ReactNode;
}

/**
 * Renders the state, or the screen's own content when it is ready.
 *
 * `stale` renders the children **as well as** the notice: 10.2.2 and 10.5.7 say stale data is
 * still shown, marked as stale — hiding it would turn a degraded source into an outage.
 */
export function StateView({ state, onRetry, children }: StateViewProps): JSX.Element {
  switch (state.kind) {
    case 'loading':
      return (
        <div role="status" aria-live="polite" data-state="loading">
          Loading…
        </div>
      );
    case 'empty':
      return (
        <div data-state="empty">
          <p>{state.message}</p>
        </div>
      );
    case 'error':
      return (
        <div role="alert" data-state="error">
          {/* 10.5.3 — cause and remedy, both, and never a stack trace. */}
          <p>{state.cause}</p>
          <p>{state.remedy}</p>
          {onRetry === undefined ? null : (
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      );
    case 'stale':
      return (
        <div data-state="stale">
          <p role="status">
            Showing data from {state.asOf.toISOString().slice(0, 16).replace('T', ' ')} — the live feed is
            unavailable.
          </p>
          {children}
        </div>
      );
    default:
      return <>{children}</>;
  }
}

/**
 * How often a shared queue re-reads itself, in milliseconds.
 *
 * Twenty seconds. Named once and shared by the three screens two people look at simultaneously,
 * so the interval is a decision rather than a number repeated in three files that drift apart.
 *
 * Chosen against the §10.1 budget rather than by feel: three polling screens at 20 s is nine
 * requests a minute per signed-in user, against an ingestion cycle that already runs every ~2.9
 * minutes on the same B1 instance. Faster than this buys reaction time nobody needs — a work
 * order is accepted and completed over tens of minutes — and spends a crew member's phone
 * battery on a screen in their pocket.
 */
export const QUEUE_REFRESH_MS = 20_000;

/**
 * 10.5.7, 11.4.5 — when this screen last heard from the server, and a way to ask again now.
 *
 * A screen that silently refreshes itself is worse than one that does not, because the reader
 * cannot tell the difference between "nothing has changed" and "nothing is arriving". Saying when
 * the data is from converts both into something checkable.
 *
 * `aria-live` is deliberately absent. This text changes every twenty seconds; announcing it would
 * interrupt a screen-reader user mid-row, forever. The manual control is what such a user needs,
 * and it is a real button rather than a hint to press F5.
 */
export function Freshness(props: {
  at: Date | null;
  everyMs: number;
  onRefresh: () => void;
}): JSX.Element {
  const seconds = Math.round(props.everyMs / 1000);
  return (
    <p data-part="freshness">
      <span data-part="at">
        {props.at === null
          ? 'Loading…'
          : `Updated ${props.at.toTimeString().slice(0, 8)} — refreshes every ${seconds} seconds`}
      </span>{' '}
      <button type="button" onClick={props.onRefresh} data-action="refresh-now">
        Refresh now
      </button>
    </p>
  );
}

/** 11.4.6 — a confirmation dialog. 11.3.4 permits a modal for exactly this and one-field input. */
export function ConfirmDialog(props: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
}): JSX.Element {
  return (
    <div role="dialog" aria-modal="true" aria-label={props.title} data-component="confirm">
      <h2>{props.title}</h2>
      <p>{props.body}</p>
      {/* Dismiss first in the DOM so Escape and the initial focus both land on the safe choice. */}
      <button type="button" onClick={props.onDismiss}>
        Cancel
      </button>
      <button type="button" onClick={props.onConfirm}>
        {props.confirmLabel}
      </button>
    </div>
  );
}

/** 11.4.5 — a transient confirmation of something that already happened. */
export function Toast(props: { message: string }): JSX.Element {
  return (
    <div role="status" aria-live="polite" data-component="toast">
      {props.message}
    </div>
  );
}

/** 7.1.x — a dashboard stat tile. `null` renders as an em dash, never as zero. */
export function StatTile(props: { label: string; value: number | null; hint?: string }): JSX.Element {
  return (
    <div data-component="stat" title={props.hint ?? ''}>
      <div data-part="value">{props.value === null ? '—' : props.value}</div>
      <div data-part="label">{props.label}</div>
    </div>
  );
}
