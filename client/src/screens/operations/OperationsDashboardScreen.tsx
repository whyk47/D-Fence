/**
 * D-Fence — Operations Dashboard (REQUIREMENTS.md 11.2.12).
 * Stereotype: <<boundary>>. Traces: 11.2.12, 7.1.x, 7.2.x, 7.5.x, 1.4.4, 10.2.2, 10.5.7, 11.7.5.
 *
 * The manager's home, and the screen where a wrong number does the most damage — every dispatch
 * decision starts here.
 *
 * Three things it refuses to do:
 *   - **Recompute anything.** 7.2.1 forbids the dashboard recalculating a score for display; every
 *     figure is the one the scoring cycle stored. A recomputed contribution would show a number
 *     that never existed in the history, and the two would diverge the first time a weight changed.
 *   - **Show a null as zero.** `StatTile` renders an absent count as an em dash. "0 open verified
 *     reports" and "we could not count them" are different facts, and a manager acts on the first.
 *   - **Hide a stale source.** 1.4.4 and 10.2.2 want degraded data shown *and* marked; the payload
 *     carries `staleSources` precisely so this screen cannot quietly omit the notice.
 */
import { useLoad } from '../../lib/useLoad';
import { StateView, StatTile } from '../../components/States';
import { link } from '../../components/Link';
import { SingaporeMap, MapCluster, MapMarker } from '../../components/SingaporeMap';
import { ScreenProps } from '../ScreenProps';

interface DashboardPayload {
  overview: {
    activeClusters: number;
    totalActiveCases: number;
    highTierClusters: number;
    openVerifiedReports: number | null;
    openWorkOrders: number | null;
    overdueWorkOrders: number | null;
    tierDistribution: Record<string, number>;
    dataAsOf: string | null;
    staleSources: string[];
  };
  /**
   * 7.5.1-7.5.4. The field names are the server's — `detail` and `link`, not `message`. They were
   * `message` here and nothing on the server ever sent one, so every item in this panel rendered
   * as an empty bullet: the panel that exists to say what needs a decision today has been saying
   * nothing at all, in production, while looking like it had nothing to say.
   */
  attention: Array<{ kind: string; detail: string; link: string }>;
}

/** 9.1.1-9.1.6 — the layers the server decided this manager may see. */
interface LayersPayload {
  clusters: MapCluster[];
  reports: Array<{ reportId: string; latitude: number; longitude: number; status: string; type: string }>;
  workOrders: Array<{ workOrderId: string; latitude: number; longitude: number; status: string; taskType: string }>;
  savedLocations: Array<{ savedLocationId: string; latitude: number; longitude: number; label: string; exposureStatus: string }>;
}

interface PriorityPayload {
  rows: Array<{
    rank: number;
    clusterId: string;
    locality: string;
    caseSize: number;
    caseDelta: number;
    score: number;
    tier: string;
    workOrderStatus: string | null;
    isDegraded: boolean;
    excludedDrivers: string[];
  }>;
}

export function OperationsDashboardScreen(props: ScreenProps): JSX.Element {
  const dashboard = useLoad<DashboardPayload>(props.api, '/api/ops/dashboard');
  const layers = useLoad<LayersPayload>(props.api, '/api/map/layers', {
    isEmpty: (v) => v.clusters.length === 0,
    emptyMessage: 'No cluster boundaries have been ingested yet, so there is nothing to draw.',
  });
  const priority = useLoad<PriorityPayload>(props.api, '/api/ops/priority', {
    isEmpty: (v) => v.rows.length === 0,
    emptyMessage: 'No clusters have been scored yet. The next ingestion cycle will populate this table.',
  });

  const overview = dashboard.value?.overview;

  // 9.1.3, 9.1.4 — reports and work orders as markers. Flattened here rather than in the map so
  // the map component stays ignorant of D-Fence's vocabulary and can be reused by the resident.
  const markers: MapMarker[] = [
    ...(layers.value?.reports ?? []).map((r) => ({
      id: r.reportId,
      latitude: r.latitude,
      longitude: r.longitude,
      title: r.type,
      detail: `Report — ${r.status}`,
      kind: 'report' as const,
    })),
    ...(layers.value?.workOrders ?? []).map((w) => ({
      id: w.workOrderId,
      latitude: w.latitude,
      longitude: w.longitude,
      title: w.taskType,
      detail: `Work order — ${w.status}`,
      kind: 'workOrder' as const,
    })),
  ];

  return (
    <section data-screen="OpsDashboard" data-requirement="11.2.12">
      <h1>Operations</h1>

      <StateView state={dashboard.state} onRetry={dashboard.retry}>
        {overview === undefined ? null : (
          <>
            {/* 1.4.4, 10.5.7 — say which source is stale and that the figures below are affected.
                A dashboard that showed the numbers alone would present last week's as today's. */}
            {overview.staleSources.length > 0 ? (
              <p role="status" data-part="stale">
                Some figures are out of date: {overview.staleSources.join(', ')} last updated too long ago.
              </p>
            ) : null}

            <p data-part="as-of">
              {/* 7.1.9 — the age of the DATA, not of the request. */}
              {overview.dataAsOf === null
                ? 'No data has been ingested yet.'
                : `Data as of ${new Date(overview.dataAsOf).toISOString().slice(0, 16).replace('T', ' ')}.`}
            </p>

            <div data-part="stats">
              <StatTile label="Active clusters" value={overview.activeClusters} />
              <StatTile label="Active cases" value={overview.totalActiveCases} />
              <StatTile label="High priority" value={overview.highTierClusters} />
              {/* null renders as an em dash — never as zero (7.1.x). */}
              <StatTile
                label="Open verified reports"
                value={overview.openVerifiedReports}
                hint="Blank when the report store could not be read."
              />
              <StatTile label="Open work orders" value={overview.openWorkOrders} />
              <StatTile label="Overdue work orders" value={overview.overdueWorkOrders} />
            </div>

            {/* 7.5.x — what needs a decision today, above the table rather than inside it. */}
            <section data-part="attention">
              <h2>Needs attention</h2>
              {(dashboard.value?.attention ?? []).length === 0 ? (
                <p data-state="empty">Nothing is waiting on you.</p>
              ) : (
                <ul data-part="attention-list">
                  {(dashboard.value?.attention ?? []).map((item, index) => (
                    <li key={`${item.kind}-${index}`} data-kind={item.kind}>
                      <span data-part="detail">{item.detail}</span>{' '}
                      {/* 7.5.4 — the place it can be resolved, one click away rather than named. */}
                      <a href={item.link} onClick={link(props, item.link)}>
                        Open
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </StateView>

      {/*
        * 9.1.1-9.1.11 — the clusters as shapes on Singapore, above the table that ranks them.
        * The table answers "which one first"; the map answers "where is that, and what is next to
        * it" — which is the question a dispatch decision actually turns on, and the one a locality
        * string of twelve road names cannot answer.
        */}
      <section data-part="map">
        <h2>Where the clusters are</h2>
        <StateView state={layers.state} onRetry={layers.retry}>
          <SingaporeMap
            label="ops-map"
            // Grey, so the tier fill is the strongest colour on the screen rather than competing
            // with a full-colour street map.
            basemap="Grey_HD"
            clusters={layers.value?.clusters ?? []}
            markers={markers}
            size="tall"
            onSelectCluster={(clusterId) => props.onNavigate(`/ops/clusters/${clusterId}`)}
          />
        </StateView>
      </section>

      <section data-part="priority">
        <h2>Priority</h2>
        <StateView state={priority.state} onRetry={priority.retry}>
          <table>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Locality</th>
                {/* 11.6.3 — the numeric columns align on their digits so two rows compare. */}
                <th scope="col" className="num">Cases</th>
                <th scope="col" className="num">Change</th>
                <th scope="col" className="num">Score</th>
                <th scope="col">Tier</th>
                <th scope="col">Work order</th>
              </tr>
            </thead>
            <tbody>
              {(priority.value?.rows ?? []).map((row) => (
                <tr key={row.clusterId} data-tier={row.tier} data-degraded={row.isDegraded}>
                  <td className="num">{row.rank}</td>
                  <td>
                    <a href={`/ops/clusters/${row.clusterId}`} onClick={link(props, `/ops/clusters/${row.clusterId}`)}>
                      {row.locality}
                    </a>
                  </td>
                  <td className="num">{row.caseSize}</td>
                  <td className="num">{row.caseDelta > 0 ? `+${row.caseDelta}` : row.caseDelta}</td>
                  {/* 7.2.8, 7.2.9 — a degraded score says so, and names what was left out. A
                      score computed without rainfall is not the same number as one computed with
                      it, and presenting them identically invites the manager to compare them.
                      The note belongs in the score's own cell: it was an eighth `<td>` on a
                      seven-column table, so every degraded row pushed a cell out past the table's
                      right border and the note appeared to belong to no column at all. */}
                  <td className="num">
                    {row.score.toFixed(1)}
                    {row.isDegraded ? (
                      <span data-part="degraded">
                        Degraded — excluded: {row.excludedDrivers.join(', ')}
                      </span>
                    ) : null}
                  </td>
                  {/* 11.7.5 — the tier as a WORD in the cell. The pill around it is decoration on
                      top of the word; remove the styling and the cell still says "High". */}
                  <td data-cell="tier">
                    <span>{row.tier}</span>
                  </td>
                  <td>{row.workOrderStatus ?? 'none'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </StateView>
      </section>

      <nav aria-label="Dashboard actions">
        <a href="/ops/dispatch" onClick={link(props, '/ops/dispatch')}>
          Today&apos;s dispatch
        </a>
        <a href="/ops/moderation" onClick={link(props, '/ops/moderation')}>
          Moderation queue
        </a>
        <a href="/ops/work-orders" onClick={link(props, '/ops/work-orders')}>
          Work orders
        </a>
      </nav>
    </section>
  );
}
