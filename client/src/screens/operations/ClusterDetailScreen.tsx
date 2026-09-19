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
import { StateView, StatTile } from '../../components/States';
import { link } from '../../components/Link';
import { Pill, Sparkline, statusTone, tierTone } from '../../components/Presentation';
import { driverHelp, driverLabel, label, withUnit } from '../../lib/labels';
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


/**
 * One driver's contribution as a percentage of the largest in the same breakdown.
 *
 * Returns 0 rather than NaN when every contribution is zero, which is a real state: a cluster
 * scored entirely on drivers that all normalised to nothing still has a row per driver, and a bar
 * of width NaN removes the cell rather than drawing an empty one.
 */
function share(breakdown: Array<{ contribution: number }>, contribution: number): number {
  const largest = Math.max(...breakdown.map((row) => row.contribution), 0);
  return largest === 0 ? 0 : (contribution / largest) * 100;
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

            {/*
              The three headline facts were three unlabelled paragraphs — "73 case(s)", "Stable",
              "Score 40.3 (Medium)" — stacked in the body type, on a screen whose whole purpose is
              to justify a rank. They are the same tiles the dashboard already uses, and the tier
              is a pill rather than a word in brackets: 11.7 wants a label AND a colour.
            */}
            <div data-part="stats">
              <StatTile label="Cases" value={value.caseSize} hint="Confirmed dengue cases NEA reports in this cluster." />
              <StatTile
                label="Priority score"
                value={value.score === null ? null : Number(value.score.toFixed(1))}
                hint="100 x severity x urgency (4.1.1). Not yet scored shows as an em dash."
              />
            </div>
            <p data-part="score">
              <Pill tone={tierTone(value.tier ?? '')} tier={value.tier ?? undefined}>
                {value.tier === null ? 'Not yet scored' : `${value.tier} priority`}
              </Pill>{' '}
              <Pill>{label(value.trajectory)}</Pill>
            </p>

            {/* 4.1.12, 7.2.8, 7.2.9 — named, not counted. */}
            {value.isDegraded ? (
              <p role="status" data-part="degraded">
                This score is degraded. Excluded drivers: {value.excludedDrivers.map(driverLabel).join(', ')}.
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
                      <th scope="col" className="num">Measured</th>
                      <th scope="col" className="num">Normalised</th>
                      <th scope="col" className="num">Weight</th>
                      <th scope="col" className="num">Contribution</th>
                      <th scope="col">Share of the score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {value.breakdown.map((row) => (
                      <tr key={row.driver}>
                        {/*
                          `driverLabel` rather than `row.driver`: this column read `CaseSize`,
                          `DaysSinceLastTreatment` and `PremisesMix` — TypeScript member names put
                          in front of a town council officer who is being asked to act on the rank.
                          The title carries the one-line explanation from 4.1.3.
                        */}
                        <td title={driverHelp(row.driver)}>{driverLabel(row.driver)}</td>
                        {/* A raw value with no unit is not a measurement. 0.526 of what? */}
                        <td className="num">{withUnit(row.driver, row.rawValue)}</td>
                        <td className="num">{row.normalisedValue.toFixed(2)}</td>
                        <td className="num">{row.weight.toFixed(2)}</td>
                        {/* Displayed, never recomputed from the two columns to its left (4.1.10). */}
                        <td className="num">{row.contribution.toFixed(2)}</td>
                        <td data-cell="bar">
                          {/*
                            Scaled against the largest contribution in THIS breakdown rather than
                            against 1.0, so the picture answers the question a manager actually has
                            — which driver put this cluster here — rather than how close the score
                            came to a theoretical maximum no cluster ever reaches.
                          */}
                          <span data-part="bar" style={{ width: `${share(value.breakdown, row.contribution)}%` }} />
                        </td>
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
                <>
                  {/*
                    Three bullet points reading "2026-09-17: 73 case(s)" three times is a table of
                    one number, and what 11.2.13 asks of this section is a trend. The figures stay
                    underneath, collapsed, because the exact numbers are what a dispute is settled
                    by — the chart is the answer, the list is the evidence.
                  */}
                  <Sparkline
                    points={value.series.map((point) => ({ label: point.date, value: point.caseSize }))}
                    unit="cases"
                  />
                  <details>
                    <summary>The daily figures</summary>
                    <ul data-cards>
                      {value.series.map((point) => (
                        <li key={point.date}>
                          <div data-part="card-meta">
                            <span>{point.date}</span>
                            <span>{point.caseSize} cases</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              )}
            </section>

            <section data-part="work">
              <h2>Work</h2>
              <p>{value.openReports} open verified report(s)</p>
              {value.openWorkOrders.length === 0 ? (
                <p data-state="empty">No open work orders for this cluster.</p>
              ) : (
                <ul data-cards>
                  {value.openWorkOrders.map((order) => (
                    <li key={order.workOrderId}>
                      <div data-part="card-head">
                        <a
                          href={`/ops/work-orders/${order.workOrderId}`}
                          onClick={link(props, `/ops/work-orders/${order.workOrderId}`)}
                        >
                          {label(order.taskType)}
                        </a>
                        <Pill tone={statusTone(order.status)}>{label(order.status)}</Pill>
                      </div>
                      <div data-part="card-meta">
                        <span>Scheduled {order.scheduledDate}</span>
                      </div>
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
