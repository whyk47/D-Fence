/**
 * D-Fence — Data Sources (REQUIREMENTS.md 11.2.23).
 * Stereotype: <<boundary>>. Traces: 11.2.23, 1.1.18, 1.4.1–1.4.4, 10.2.2, 10.5.7, 11.7.5.
 *
 * The screen that says whether the numbers on every other screen can be trusted today.
 *
 * Two states are shown, and they are deliberately different bars. `isWarning` (1.4.3) means three
 * consecutive failures or three of the source's own intervals without a success — an alarm.
 * `isStale` (1.4.4) means the data is older than one interval — a marker on the data, not an
 * alarm. Collapsing them would either cry wolf on every missed cycle or stay silent through a
 * dead feed, and the whole value of this screen is telling those two apart.
 *
 * "Never succeeded" is rendered as its own sentence rather than as a very old timestamp: 1.4.1
 * distinguishes them, and "last success: never" is a different problem from "last success: Tuesday".
 *
 * 1.1.18's manual run lives here rather than on the dashboard because this is the screen a manager
 * is already on when they want it: a source has just been reported as failing, and the question
 * "is it back?" should be answerable without waiting an hour for the next scheduled cycle.
 */
import { useState } from 'react';
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { ApiError } from '../../lib/ApiClient';
import { ScreenProps } from '../ScreenProps';

/** What POST /api/ops/sources/refresh answers with (1.1.18). */
interface RefreshResult {
  runs: Array<{ source: string; outcome: string; featureCount: number }>;
}

interface SourcesPayload {
  sources: Array<{
    source: string;
    lastSuccessAt: string | null;
    isWarning: boolean;
    isStale: boolean;
    consecutiveFailures?: number;
  }>;
}

export function DataSourcesScreen(props: ScreenProps): JSX.Element {
  const { state, value, retry } = useLoad<SourcesPayload>(props.api, '/api/ops/sources', {
    isEmpty: (v) => v.sources.length === 0,
    emptyMessage: 'No sources are registered.',
  });

  // Deliberately not a `LoadState`: this is an action's outcome, not the screen's data. Folding it
  // into the table's state would blank the table while the run is in flight, and the previous
  // reading is exactly what the manager wants to compare the new one against.
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setRunning(true);
    setOutcome(null);
    try {
      const result = await props.api.post<RefreshResult>('/api/ops/sources/refresh', {});
      setOutcome(
        result.runs.length === 0
          ? 'The run completed, but no source reported back.'
          : result.runs.map((r) => `${r.source}: ${describeOutcome(r)}`).join(' · '),
      );
      // The table is reloaded rather than replaced from the response body: `useLoad` owns this
      // screen's data, and writing to it from two places is how the two disagree.
      retry();
    } catch (error) {
      // 10.5.3 — the server's own cause and remedy, not a generic apology. A 409 here means
      // somebody (or the previous click) is already running one, and saying so is the answer.
      const failure = error instanceof ApiError ? error.failure : null;
      setOutcome(
        failure === null
          ? 'The run could not be started. Try again shortly.'
          : `${failure.error} — ${failure.remedy}`,
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <section data-screen="DataSources" data-requirement="11.2.23">
      <h1>Data sources</h1>

      {/* 1.1.18 — outside StateView on purpose: a source health request that failed is one of the
          moments the manager most wants this button, and hiding it behind its own error would
          leave them with a retry and no way to make the thing they are retrying succeed. */}
      <p data-part="refresh">
        <button type="button" onClick={() => void refresh()} disabled={running} data-action="refresh">
          {running ? 'Refreshing…' : 'Refresh now'}
        </button>{' '}
        <span data-part="refresh-note">
          Fetches every source immediately and rescores. Sources are refreshed on their own
          schedule regardless.
        </span>
      </p>
      {/* 11.7.5, 11.4.x — the result in words, and announced: a manager who has just pressed a
          button that takes seconds needs to be told it finished. */}
      {outcome === null ? null : (
        <p data-part="refresh-outcome" role="status">
          {outcome}
        </p>
      )}

      <StateView state={state} onRetry={retry}>
        <table>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Last success</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            {(value?.sources ?? []).map((source) => (
              <tr key={source.source} data-warning={source.isWarning} data-stale={source.isStale}>
                <td>{source.source}</td>
                <td>
                  {/* 1.4.1 — never is not "long ago". */}
                  {source.lastSuccessAt === null
                    ? 'Never'
                    : new Date(source.lastSuccessAt).toISOString().slice(0, 16).replace('T', ' ')}
                </td>
                {/* 11.7.5 — the state in words. A row coloured red and nothing else would be
                    invisible to a screen reader and ambiguous to everyone else. */}
                <td>{describe(source)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </StateView>
    </section>
  );
}

/** 1.1.21 — UNCHANGED is a successful run that found nothing new, and must not read as a failure. */
function describeOutcome(run: { outcome: string; featureCount: number }): string {
  if (run.outcome === 'UNCHANGED') {
    return 'no change published';
  }
  if (run.outcome === 'FAILED') {
    return 'failed';
  }
  return `${run.featureCount} record(s)`;
}

/**
 * 1.4.3 and 1.4.4 as two distinct sentences.
 *
 * The order matters: a warning is also stale, and reporting only "stale" for a source that has
 * failed three times running would understate it.
 */
function describe(source: { isWarning: boolean; isStale: boolean; lastSuccessAt: string | null }): string {
  if (source.isWarning) {
    return source.lastSuccessAt === null
      ? 'Failing — this source has never succeeded.'
      : 'Failing — three consecutive cycles without a success.';
  }
  if (source.isStale) {
    return 'Stale — the data is older than one cycle. Figures derived from it are marked.';
  }
  return 'Healthy.';
}
