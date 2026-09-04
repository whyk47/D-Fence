/**
 * D-Fence — Data Sources (REQUIREMENTS.md 11.2.23).
 * Stereotype: <<boundary>>. Traces: 11.2.23, 1.4.1–1.4.4, 10.2.2, 10.5.7, 11.7.5.
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
 */
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { ScreenProps } from '../ScreenProps';

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

  return (
    <section data-screen="DataSources" data-requirement="11.2.23">
      <h1>Data sources</h1>

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
