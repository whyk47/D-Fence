/**
 * D-Fence — My Reports screen (REQUIREMENTS.md 11.2.9).
 * Stereotype: <<boundary>>. Traces: 11.2.9, 5.2.1–5.2.4, 11.4.2, 10.5.1.
 *
 * A resident's own reports, with the status each has reached. The status words are the data
 * dictionary's (10.5.1) rather than friendlier synonyms — a resident who is told their report was
 * "Verified" and an operations manager reading "Verified" on the same report must be reading about
 * the same thing, or the two cannot discuss it.
 */
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { link } from '../../components/Link';
import { Pill, statusTone } from '../../components/Presentation';
import { label } from '../../lib/labels';
import { ScreenProps } from '../ScreenProps';

interface ReportSummary {
  id: string;
  type: string;
  status: string;
  submittedAt: string;
  // `localityBinding`, not `locality`. /api/reports/mine serialises the Report entity as it stands,
  // and the entity's field is localityBinding — so the name here is not a choice. Reading `locality`
  // yielded `undefined`, which slipped past a `=== null` guard and rendered the literal string
  // "undefined" on every row of the resident's main screen. This is the same defect class the client
  // acceptance harness was written to catch; it survived because that harness covers no resident
  // screen. Widening its coverage is the actual fix, of which this is only the symptom.
  localityBinding: string | null;
  corroborationCount: number;
}

export function MyReportsScreen(props: ScreenProps): JSX.Element {
  const { state, value, retry } = useLoad<{ reports: ReportSummary[] }>(props.api, '/api/reports/mine', {
    isEmpty: (v) => v.reports.length === 0,
    emptyMessage: 'You have not submitted any reports. If you see standing water or uncleared refuse, report it here.',
  });

  return (
    <section data-screen="MyReports" data-requirement="11.2.9">
      <h1>My reports</h1>
      <a href="/report" onClick={link(props, '/report')}>
        Report a site
      </a>

      <StateView state={state} onRetry={retry}>
        <ul data-part="reports" data-cards>
          {(value?.reports ?? []).map((report) => (
            <li key={report.id} data-status={report.status}>
              <div data-part="card-head">
                <a href={`/reports/${report.id}`} onClick={link(props, `/reports/${report.id}`)}>
                  {label(report.type)}
                </a>
                {/* 11.7.5 — the status is a word in its own right, and now a colour as well. */}
                <Pill tone={statusTone(report.status)}>
                  <span data-part="status">{label(report.status)}</span>
                </Pill>
              </div>
              <div data-part="card-meta">
                {report.localityBinding === null || report.localityBinding === undefined ? null : (
                  <span>{report.localityBinding}</span>
                )}
                {/*
                  The word "Submitted" appeared twice in every row — once as the status and once
                  as the label on the date — which read as a stutter and told the resident nothing
                  the pill above does not.
                */}
                <span data-part="submitted">
                  {new Date(report.submittedAt).toISOString().slice(0, 16).replace('T', ' ')} SGT
                </span>
                {report.corroborationCount > 0 ? (
                  <span data-part="corroborations">
                    {report.corroborationCount} neighbour{report.corroborationCount === 1 ? '' : 's'} confirmed this
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </StateView>
    </section>
  );
}
