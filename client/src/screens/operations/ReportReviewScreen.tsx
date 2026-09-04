/**
 * D-Fence — Report Review (REQUIREMENTS.md 11.2.15).
 * Stereotype: <<boundary>>. Traces: 11.2.15, 5.2.3, 5.2.4, 5.3.4, 2.3.4, 11.4.6, 10.5.3.
 *
 * Verify and Reject are not symmetrical, and the screen says so. Rejection requires a reason
 * (5.2.4) because the reason is what the resident is shown and what a later dispute is settled by;
 * verification does not, because "it is real" adds nothing to the record.
 *
 * Both are confirmed before they are sent (11.4.6). Neither is reversible from here — 5.2.3 makes
 * moderation a one-way transition — and a one-way action reached by a single click on a list is an
 * action that will occasionally be taken by accident.
 */
import { useState } from 'react';
import { ApiError } from '../../lib/ApiClient';
import { useLoad } from '../../lib/useLoad';
import { ConfirmDialog, StateView } from '../../components/States';
import { Field, field, FormField } from '../../components/Field';
import { evaluate, formIsValid, required } from '../../components/FieldValidation';
import { link } from '../../components/Link';
import { ScreenProps } from '../ScreenProps';

interface ReviewPayload {
  report: {
    id: string;
    type: string;
    description: string;
    localityBinding: string;
    status: string;
    corroborationCount: number;
    submittedAt: string;
  };
  photos: Array<{ id: string; filename: string }>;
}

export function ReportReviewScreen(props: ScreenProps): JSX.Element {
  const id = props.params['id'] ?? '';
  const { state, value, retry } = useLoad<ReviewPayload>(props.api, `/api/ops/moderation/${id}`);
  const [confirming, setConfirming] = useState<'verify' | 'reject' | null>(null);
  const [reason, setReason] = useState<FormField>(field());
  const [failure, setFailure] = useState<{ cause: string; remedy: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reasonRules = [required('Reason')];

  async function send(action: 'verify' | 'reject'): Promise<void> {
    setConfirming(null);
    setBusy(true);
    setFailure(null);
    try {
      await props.api.post(
        `/api/ops/moderation/${id}/${action}`,
        action === 'reject' ? { reason: reason.value.trim() } : {},
      );
      // Back to the queue: the next report is the manager's next action, and staying on a report
      // that can no longer be acted on is a dead end.
      props.onNavigate('/ops/moderation');
    } catch (error) {
      const f = error instanceof ApiError ? error.failure : null;
      setFailure({ cause: f?.error ?? 'that could not be recorded', remedy: f?.remedy ?? 'try again shortly' });
    } finally {
      setBusy(false);
    }
  }

  const report = value?.report;

  return (
    <section data-screen="ReportReview" data-requirement="11.2.15">
      <a href="/ops/moderation" onClick={link(props, '/ops/moderation')}>
        Back to the queue
      </a>

      <StateView state={state} onRetry={retry}>
        {report === undefined ? null : (
          <article>
            <h1>{report.type}</h1>
            <p data-part="status">{report.status}</p>
            <p data-part="locality">{report.localityBinding}</p>
            <p data-part="description">{report.description}</p>
            <p data-part="submitted">
              Submitted {new Date(report.submittedAt).toISOString().slice(0, 16).replace('T', ' ')}
            </p>
            <p data-part="corroborations">{report.corroborationCount} corroboration(s)</p>

            {/* 2.3.4, 5.3.4 — a manager sees the photographs; this is the screen they exist for. */}
            <ul data-part="photos">
              {(value?.photos ?? []).map((photo) => (
                <li key={photo.id}>{photo.filename}</li>
              ))}
            </ul>

            <Field
              id="reason"
              label="Reason for rejection"
              multiline
              value={reason.value}
              touched={reason.touched}
              rules={reasonRules}
              hint="Shown to the resident who submitted the report (5.2.4). Required to reject; ignored when verifying."
              onChange={(v) => setReason({ value: v, touched: reason.touched })}
            />

            <div data-part="actions">
              <button type="button" onClick={() => setConfirming('verify')} disabled={busy}>
                Verify
              </button>
              <button
                type="button"
                onClick={() => {
                  setReason((f) => ({ ...f, touched: true }));
                  // 5.2.4 — a rejection with no reason is refused here, not sent and bounced.
                  if (formIsValid([evaluate(reason.value, reasonRules)])) {
                    setConfirming('reject');
                  }
                }}
                disabled={busy}
              >
                Reject
              </button>
            </div>

            {failure === null ? null : (
              <div role="alert" data-part="error">
                <p>{failure.cause}</p>
                <p>{failure.remedy}</p>
              </div>
            )}
          </article>
        )}
      </StateView>

      {confirming === null ? null : (
        <ConfirmDialog
          title={confirming === 'verify' ? 'Verify this report?' : 'Reject this report?'}
          body={
            confirming === 'verify'
              ? 'A verified report counts towards its cluster’s priority and can be linked to a work order. This cannot be undone.'
              : 'The resident will be shown your reason. This cannot be undone.'
          }
          confirmLabel={confirming === 'verify' ? 'Verify' : 'Reject'}
          onConfirm={() => void send(confirming)}
          onDismiss={() => setConfirming(null)}
        />
      )}
    </section>
  );
}
