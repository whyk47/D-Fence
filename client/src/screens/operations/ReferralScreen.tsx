/**
 * D-Fence — Referral screen (REQUIREMENTS.md 11.2.28).
 * Stereotype: <<boundary>>. Traces: 11.2.28, 8.6.1–8.6.9, 8.1.14, 8.1.15, 11.3.21, 10.5.3, 11.7.5.
 *
 * Where an Operations Manager sends a case D-Fence has no authority to act on, and where the
 * outcome comes back.
 *
 * The destination is displayed, never chosen (8.6.2). It is read from the pest profile, and letting
 * a manager pick would make the authority a matter of opinion rather than of the catalogue — which
 * is exactly the ambiguity the profile exists to settle.
 *
 * **The screen says what a referral is not.** No work order and no treatment record is written
 * (8.6.10, 8.6.11), and the note saying so is on the screen rather than only in the requirement,
 * because the person clicking the button is the person who would otherwise expect a crew to turn up.
 */
import { useState } from 'react';
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { ApiError } from '../../lib/ApiClient';
import { link } from '../../components/Link';
import { ScreenProps } from '../ScreenProps';

interface ReferralView {
  reportId: string;
  pestType: string;
  destinationAuthority: string;
  destinationContactNumber: string;
  referral: {
    id: string;
    referredAt: string;
    reason: string;
    outcome: string | null;
    outcomeRecordedAt: string | null;
  } | null;
}

function readable(pestType: string): string {
  return pestType.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function ReferralScreen(props: ScreenProps): JSX.Element {
  const reportId = props.params.id ?? '';
  const { state, value, retry } = useLoad<ReferralView>(
    props.api,
    `/api/ops/referrals/${encodeURIComponent(reportId)}`,
  );

  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /** 10.5.3 — the server's own cause and remedy, not a generic apology. */
  function explain(error: unknown): string {
    const failure = error instanceof ApiError ? error.failure : null;
    return failure === null
      ? 'That could not be completed. Try again shortly.'
      : `${failure.error} — ${failure.remedy}`;
  }

  async function refer(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await props.api.post(`/api/ops/referrals/${encodeURIComponent(reportId)}/refer`, { reason });
      setMessage('Referred. The resident has been told who it went to.');
      setReason('');
      retry();
    } catch (error) {
      setMessage(explain(error));
    } finally {
      setBusy(false);
    }
  }

  async function record(referralId: string): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await props.api.post(`/api/ops/referrals/${encodeURIComponent(referralId)}/outcome`, { outcome });
      setMessage('Outcome recorded. The report is closed.');
      setOutcome('');
      retry();
    } catch (error) {
      setMessage(explain(error));
    } finally {
      setBusy(false);
    }
  }

  const existing = value?.referral ?? null;

  return (
    <section data-screen="Referral" data-requirement="11.2.28">
      <h1>Refer to an external authority</h1>

      <StateView state={state} onRetry={retry}>
        <dl data-part="destination">
          <dt>Pest</dt>
          <dd>{readable(value?.pestType ?? '')}</dd>
          {/* 8.6.2 — read from the pest profile, not chosen here. */}
          <dt>Authority</dt>
          <dd>{value?.destinationAuthority}</dd>
          {/* 8.6.3 — the published number, so the manager can call as well as refer. */}
          <dt>Contact</dt>
          <dd>
            <a href={`tel:${(value?.destinationContactNumber ?? '').replace(/\s/g, '')}`}>
              {value?.destinationContactNumber}
            </a>
          </dd>
        </dl>

        {/* 8.6.10, 8.6.11 — stated on the screen, not only in the requirement. */}
        <p data-part="not-a-work-order">
          A referral does not create a work order and does not record a treatment. No D-Fence crew is
          sent, and the locality is not counted as treated.
        </p>

        {existing === null ? (
          <form
            data-part="refer"
            onSubmit={(e) => {
              e.preventDefault();
              void refer();
            }}
          >
            <label htmlFor="reason">Why this authority, and what was reported</label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              // 8.6.4 — the reason is what the authority reads. The server refuses anything under
              // ten characters; saying so here means the manager is not refused after typing.
              minLength={10}
              required
            />
            <button type="submit" disabled={busy} data-action="refer">
              {busy ? 'Referring…' : `Refer to ${value?.destinationAuthority ?? 'the authority'}`}
            </button>
          </form>
        ) : (
          <div data-part="referred">
            <p>
              Referred to {value?.destinationAuthority} on{' '}
              {existing.referredAt.slice(0, 16).replace('T', ' ')}.
            </p>
            <p data-part="reason">{existing.reason}</p>

            {existing.outcomeRecordedAt === null ? (
              <form
                data-part="outcome"
                onSubmit={(e) => {
                  e.preventDefault();
                  void record(existing.id);
                }}
              >
                {/* 8.6.8, 8.6.9 — recording the outcome is what closes the report. */}
                <label htmlFor="outcome">What did they do?</label>
                <textarea
                  id="outcome"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  rows={3}
                  required
                />
                <button type="submit" disabled={busy} data-action="record-outcome">
                  {busy ? 'Recording…' : 'Record outcome and close'}
                </button>
              </form>
            ) : (
              <p data-part="closed">
                Outcome recorded {existing.outcomeRecordedAt.slice(0, 16).replace('T', ' ')}:{' '}
                {existing.outcome}
              </p>
            )}
          </div>
        )}

        {/* 11.7.5, 11.4.x — the result in words, and announced. */}
        {message === null ? null : (
          <p role="status" data-part="message">
            {message}
          </p>
        )}
      </StateView>

      {/* 11.3.3 — a return path, and the one the dialog map draws. */}
      <p data-part="actions">
        <a
          href={`/ops/moderation/${encodeURIComponent(reportId)}`}
          onClick={link(props, `/ops/moderation/${encodeURIComponent(reportId)}`)}
        >
          Back to the report
        </a>
      </p>
    </section>
  );
}
