/**
 * D-Fence — Cluster Detail (REQUIREMENTS.md 11.2.13).
 * Stereotype: <<boundary>>. Traces: 11.2.13, 9.1.7–9.1.10, 4.1.10, 4.1.12, 7.2.1, 7.2.8, 7.2.9.
 *
 * This is the screen that answers "why is this ranked here", and it is the reason 4.1.10 stores
 * the breakdown rather than letting anything recompute it. Every contribution shown is the one the
 * scoring cycle recorded: raw value, normalised value, weight, product. A screen that multiplied
 * the numbers itself would show a figure that never existed in the history, and would keep showing
 * a plausible one after a weight changed.
 *
 * When a score is degraded (4.1.12), the excluded drivers are named rather than merely counted. "3
 * drivers excluded" tells a manager the score is unreliable; "rainfall excluded" tells them *how*,
 * which is what decides whether to trust the rank today.
 */
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { link } from '../../components/Link';
import { ScreenProps } from '../ScreenProps';

interface ClusterDetailPayload {
  clusterId: string;
  locality: string;
  caseSize: number;
  score: number | null;
  tier: string | null;
  breakdown: Array<{
    driver: string;
    rawValue: number;
    normalisedValue: number;
    weight: number;
    contribution: number;
  }>;
  isDegraded: boolean;
  excludedDrivers: string[];
  openReports: number;
  openWorkOrders: Array<{ workOrderId: string; status: string; taskType: string; scheduledDate: string }>;
  series: Array<{ date: string; caseSize: number }>;
  trajectory: string;
}

export function ClusterDetailScreen(props: ScreenProps): JSX.Element {
  const id = props.params['id'] ?? '';
  const { state, value, retry } = useLoad<ClusterDetailPayload>(props.api, `/api/map/clusters/${id}`);

  return (
    <section data-screen="ClusterDetail" data-requirement="11.2.13">
      <a href="/ops" onClick={link(props, '/ops')}>
        Back to the dashboard
      </a>

      <StateView state={state} onRetry={retry}>
        {value === null ? null : (
          <article>
            <h1>{value.locality}</h1>
            <p data-part="cases">{value.caseSize} case(s)</p>
            <p data-part="trajectory">{value.trajectory}</p>
            <p data-part="score">
              {value.score === null ? 'Not yet scored.' : `Score ${value.score.toFixed(1)} (${value.tier ?? '—'})`}
            </p>

            {/* 4.1.12, 7.2.8, 7.2.9 — named, not counted. */}
            {value.isDegraded ? (
              <p role="status" data-part="degraded">
                This score is degraded. Excluded drivers: {value.excludedDrivers.join(', ')}.
              </p>
            ) : null}

            <section data-part="breakdown">
              <h2>How this score was reached</h2>
              {value.breakdown.length === 0 ? (
                <p data-state="empty">No breakdown was recorded for this cluster.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Driver</th>
                      <th scope="col">Raw</th>
                      <th scope="col">Normalised</th>
                      <th scope="col">Weight</th>
                      <th scope="col">Contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {value.breakdown.map((row) => (
                      <tr key={row.driver}>
                        <td>{row.driver}</td>
                        <td>{row.rawValue}</td>
                        <td>{row.normalisedValue.toFixed(2)}</td>
                        <td>{row.weight.toFixed(2)}</td>
                        {/* Displayed, never recomputed from the two columns to its left (4.1.10). */}
                        <td>{row.contribution.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section data-part="history">
              <h2>Case history</h2>
              {value.series.length === 0 ? (
                <p data-state="empty">No history has accumulated yet.</p>
              ) : (
                <ul>
                  {value.series.map((point) => (
                    <li key={point.date}>
                      {point.date}: {point.caseSize} case(s)
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section data-part="work">
              <h2>Work</h2>
              <p>{value.openReports} open verified report(s)</p>
              {value.openWorkOrders.length === 0 ? (
                <p data-state="empty">No open work orders for this cluster.</p>
              ) : (
                <ul>
                  {value.openWorkOrders.map((order) => (
                    <li key={order.workOrderId}>
                      <a
                        href={`/ops/work-orders/${order.workOrderId}`}
                        onClick={link(props, `/ops/work-orders/${order.workOrderId}`)}
                      >
                        {order.taskType} — {order.status}, scheduled {order.scheduledDate}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <a
                href={`/ops/work-orders/new?clusterId=${value.clusterId}`}
                onClick={link(props, `/ops/work-orders/new?clusterId=${value.clusterId}`)}
              >
                Raise a work order
              </a>
            </section>
          </article>
        )}
      </StateView>
    </section>
  );
}
