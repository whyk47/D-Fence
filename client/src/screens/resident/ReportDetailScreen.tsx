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

export function ReportDetailScreen(props: ScreenProps): JSX.Element {
  const id = props.params['id'] ?? '';
  const { state, value, retry } = useLoad<ReportView>(props.api, `/api/reports/${id}`);
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
            <h1>{report.type}</h1>
            <p data-part="status">{report.status}</p>
            <p data-part="locality">{report.localityBinding}</p>
            <p data-part="description">{report.description}</p>
            <p data-part="submitted">
              Submitted {new Date(report.submittedAt).toISOString().slice(0, 16).replace('T', ' ')}
            </p>

            {/* 5.2.x — photographs are withheld until a report has been triaged, so a rejected or
                unreviewed submission cannot be used to publish an image of somebody's property. */}
            {report.photosVisible ? (
              <ul data-part="photos">
                {(value?.photos ?? []).map((photo) => (
                  <li key={photo.id}>{photo.filename}</li>
                ))}
              </ul>
            ) : (
              <p data-part="photos-withheld">Photographs are shown once the report has been reviewed.</p>
            )}

            <p data-part="corroborations">
              {report.corroborationCount === 0
                ? 'No other residents have confirmed this yet.'
                : `${report.corroborationCount} other resident(s) have confirmed this.`}
            </p>
            <button type="button" onClick={() => void corroborate()} disabled={busy}>
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
