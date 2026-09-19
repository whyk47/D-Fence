/**
 * D-Fence — Report Detail screen (REQUIREMENTS.md 11.2.10).
 * Stereotype: <<boundary>>. Traces: 11.2.10, 5.1.12, 5.1.13, 5.2.1–5.2.4, 11.4.4, 10.5.3.
 *
 * Corroboration (5.1.12) is the one action here, and 5.1.13 allows a resident exactly one per
 * report. The button is therefore **not** hidden once pressed on the strength of a local flag: the
 * screen re-reads the count from the server, because a stale local "already done" would hide the
 * control from someone whose corroboration never actually landed.
 *
 * A second attempt is refused by the server with a 409, and that refusal is shown as an ordinary
 * sentence rather than an error — pressing twice is a normal thing for a person to do.
 */
import { useState } from 'react';
import { ApiError } from '../../lib/ApiClient';
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { link } from '../../components/Link';
import { Facts, PhotoGrid, Pill, statusTone } from '../../components/Presentation';
import { label } from '../../lib/labels';
import { ScreenProps } from '../ScreenProps';

interface ReportView {
  report: {
    id: string;
    type: string;
    description: string;
    localityBinding: string;
    status: string;
    corroborationCount: number;
    submittedAt: string;
    photosVisible: boolean;
  };
  photos: Array<{ id: string; filename: string; storageKey: string }>;
}

/** `GET /api/reports/:id/history`. 11.2.10's third element, after the report and its photographs. */
interface HistoryPayload {
  history: Array<{ from: string | null; to: string; at: string }>;
}

/**
 * One status change, as a sentence rather than an arrow between two identifiers.
 *
 * `Submitted → Verified` is how the transition table stores it and is exactly what a resident
 * should not be shown: the words are the system's, the arrow assumes the reader knows the state
 * machine, and "Actioned" means nothing to someone waiting to hear about a drain. Each of the five
 * states in 5.2.1 gets the sentence a person would use for it, and the fallback still reads as
 * English if a sixth is ever added.
 */
function said(entry: { from: string | null; to: string }): string {
  switch (entry.to) {
    case 'Submitted':
      return 'You sent this report';
    case 'Verified':
      return 'A town council officer confirmed the site';
    case 'Rejected':
      return 'A town council officer could not confirm the site';
    case 'Actioned':
      return 'A cleaning crew was sent';
    case 'Closed':
      return 'The work was checked and the report closed';
    default:
      return `Status changed to ${label(entry.to)}`;
  }
}

export function ReportDetailScreen(props: ScreenProps): JSX.Element {
  const id = props.params['id'] ?? '';
  const { state, value, retry } = useLoad<ReportView>(props.api, `/api/reports/${id}`);
  /*
    A second request, because the history is readable by fewer people than the report (5.2.9). A
    resident looking at somebody else's report gets the report and a refusal for the history, and
    `StateView` renders that refusal inside the section rather than emptying the screen — which is
    the honest outcome: the report is there, this part of it is not theirs to read.
  */
  const history = useLoad<HistoryPayload>(props.api, `/api/reports/${id}/history`);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function corroborate(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      await props.api.post(`/api/reports/${id}/corroborate`, {});
      setNotice('Thank you — your confirmation has been recorded.');
      // 5.1.13 — the count comes back from the server, never from incrementing a local number.
      retry();
      // A corroboration can carry a report over 5.1.14's threshold, which is a status change.
      history.retry();
    } catch (error) {
      const failure = error instanceof ApiError ? error.failure : null;
      setNotice(
        failure?.status === 409
          ? 'You have already confirmed this report.'
          : `${failure?.error ?? 'that could not be recorded'} — ${failure?.remedy ?? 'try again shortly'}`,
      );
    } finally {
      setBusy(false);
    }
  }

  const report = value?.report;

  return (
    <section data-screen="ReportDetail" data-requirement="11.2.10">
      <a href="/reports" onClick={link(props, '/reports')}>
        Back to my reports
      </a>

      <StateView state={state} onRetry={retry}>
        {report === undefined ? null : (
          <article>
            <h1>
              {label(report.type)}{' '}
              <Pill tone={statusTone(report.status)}>
                <span data-part="status">{label(report.status)}</span>
              </Pill>
            </h1>

            <Facts
              items={[
                { label: 'Where', value: report.localityBinding, part: 'locality' },
                {
                  label: 'Submitted',
                  value: new Date(report.submittedAt).toISOString().slice(0, 16).replace('T', ' ') + ' SGT',
                  part: 'submitted',
                },
                { label: 'What you wrote', value: report.description, part: 'description', wide: true },
              ]}
            />

            {/* 5.2.x — photographs are withheld until a report has been triaged, so a rejected or
                unreviewed submission cannot be used to publish an image of somebody's property. */}
            {report.photosVisible || (value?.photos ?? []).length > 0 ? (
              <PhotoGrid
                path={`report/${id}`}
                photos={value?.photos ?? []}
                emptyMessage="You did not attach a photograph to this report."
              />
            ) : (
              <p data-part="photos-withheld">Photographs are shown once the report has been reviewed.</p>
            )}

            {/* 11.2.10 — "its photographs and its status history". The history was recorded from
                the first day (`report_status_change`, written on the one path that may change a
                status) and read by nothing: `ReportStore.statusHistory` and
                `ReportController.statusHistory` both existed, authorisation and all, and no route
                and no screen had ever called either. This is the third instance of that shape
                found this month, after the photograph links and the crew's completion evidence. */}
            <section data-part="history">
              <h2>What has happened to this report</h2>
              <StateView state={history.state} onRetry={history.retry}>
                {/* `?? []`, not `history.value.history`: a payload that arrives without the field
                    — an older server behind a cached client, a proxy answering something else —
                    would otherwise throw inside the render and take the whole report off the
                    screen, including the parts that did load. */}
                {history.value == null ? null : (history.value.history ?? []).length === 0 ? (
                  <p data-part="history-empty">Nothing has been recorded against this report yet.</p>
                ) : (
                  <ol data-part="history-list">
                    {(history.value.history ?? []).map((entry) => (
                      <li key={`${entry.at}-${entry.to}`} data-status={entry.to}>
                        <span data-part="what">{said(entry)}</span>
                        <span data-part="when">
                          {new Date(entry.at).toLocaleString('en-SG', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </StateView>
            </section>

            <p data-part="corroborations">
              {report.corroborationCount === 0
                ? 'No other residents have confirmed this yet.'
                : `${report.corroborationCount} other resident(s) have confirmed this.`}
            </p>
            <button type="button" data-variant="primary" onClick={() => void corroborate()} disabled={busy}>
              I have seen this too
            </button>
            {notice === null ? null : (
              <p role="status" data-part="notice">
                {notice}
              </p>
            )}
          </article>
        )}
      </StateView>
    </section>
  );
}
