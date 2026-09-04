/**
 * D-Fence — Alert Settings screen (REQUIREMENTS.md 11.2.11).
 * Stereotype: <<boundary>>. Traces: 11.2.11, 6.1.1–6.1.8, 6.2.x, 11.4.2, 10.5.3.
 *
 * Two halves, in the order they must happen: link a Telegram account, then choose what it is told.
 *
 * The linking code is shown with its expiry (6.1.7 gives it fifteen minutes). A code displayed
 * without a deadline is a code someone will come back to tomorrow and blame the system for.
 *
 * The delivery history below is the honest part of §6: 6.2.x records failed and suppressed
 * deliveries as well as sent ones, and showing only the successes would tell a resident their
 * alerts are working when the last three never arrived.
 */
import { useState } from 'react';
import { ApiError } from '../../lib/ApiClient';
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { link } from '../../components/Link';
import { ScreenProps } from '../ScreenProps';

interface AlertHistory {
  alerts: Array<{ trigger: string; outcome: string; sentAt: string; attempts: number; message: string }>;
}

interface LinkCode {
  code: string;
  expiresAt: string;
  next: string;
}

export function AlertSettingsScreen(props: ScreenProps): JSX.Element {
  const { state, value, retry } = useLoad<AlertHistory>(props.api, '/api/alerts', {
    isEmpty: (v) => v.alerts.length === 0,
    emptyMessage: 'No alerts have been sent yet. Link Telegram and add a saved location to start receiving them.',
  });
  const [code, setCode] = useState<LinkCode | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(): Promise<void> {
    setBusy(true);
    setFailure(null);
    try {
      setCode(await props.api.post<LinkCode>('/api/alerts/link', {}));
    } catch (error) {
      const f = error instanceof ApiError ? error.failure : null;
      setFailure(`${f?.error ?? 'a code could not be issued'} — ${f?.remedy ?? 'try again shortly'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-screen="AlertSettings" data-requirement="11.2.11">
      <h1>Alerts</h1>

      <section data-part="telegram">
        <h2>Telegram</h2>
        <p>
          D-Fence sends alerts through Telegram. Request a code, then send it to the D-Fence bot to
          link your account.
        </p>
        <button type="button" onClick={() => void requestCode()} disabled={busy}>
          {busy ? 'Requesting…' : 'Request a linking code'}
        </button>
        {code === null ? null : (
          <div role="status" data-part="code">
            <p data-part="digits">{code.code}</p>
            <p>{code.next}</p>
            {/* 6.1.7 — fifteen minutes. Stated, so the code is not treated as permanent. */}
            <p data-part="expires">
              This code expires at {new Date(code.expiresAt).toISOString().slice(11, 16)} UTC.
            </p>
          </div>
        )}
        {failure === null ? null : (
          <p role="alert" data-part="error">
            {failure}
          </p>
        )}
      </section>

      <section data-part="locations">
        <h2>What you are alerted about</h2>
        {/* The per-location switches live on the location itself, because that is what they belong
            to — a threshold with no location to apply it to is a setting about nothing. */}
        <p>
          Alerts are set per saved location. Open a location to choose its triggers and its growth
          threshold.
        </p>
        <a href="/locations" onClick={link(props, '/locations')}>
          My locations
        </a>
      </section>

      <section data-part="history">
        <h2>Recent alerts</h2>
        <StateView state={state} onRetry={retry}>
          <ul>
            {(value?.alerts ?? []).map((alert, index) => (
              <li key={`${alert.sentAt}-${index}`} data-outcome={alert.outcome}>
                <p data-part="message">{alert.message}</p>
                <p data-part="meta">
                  {alert.trigger} — {alert.outcome}
                  {alert.attempts > 1 ? ` after ${alert.attempts} attempts` : ''} —{' '}
                  {new Date(alert.sentAt).toISOString().slice(0, 16).replace('T', ' ')}
                </p>
              </li>
            ))}
          </ul>
        </StateView>
      </section>
    </section>
  );
}
