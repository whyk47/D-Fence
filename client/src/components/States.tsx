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
