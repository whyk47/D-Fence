/**
 * D-Fence — Analytics (REQUIREMENTS.md 11.2.26).
 * Stereotype: <<boundary>>. Traces: 11.2.26, 7.3.1–7.3.5, 10.5.3, 10.5.7, 11.4.1–11.4.4, 11.7.5.
 *
 * `AnalyticsController` has built all five §7.3 visualisations for some time, `GET
 * /api/ops/analytics` has answered with all five, and no screen rendered any of them — so the work
 * was done and unreachable. This file is only the display; every number below is computed on the
 * server, because 7.3.1 and 7.3.5 read thirty days of snapshots and shipping those to a browser to
 * be counted would put the §10.1 read budget on the network.
 *
 * **The sufficiency statement is the point of this screen, not a caveat on it.** The controller
 * returns `sufficient` and, when false, a sentence saying what is missing. A chart drawn without it
 * makes a claim the data does not support — three days of snapshots drawn as a 30-day series reads
 * as "cases are steady", and a median over one work order reads as "a job takes six hours". So the
 * insufficiency is rendered *above* each chart, in words, in the same visual weight as the chart
 * itself. It is never a footnote, never grey-on-grey, and never colour alone (11.7.5).
 *
 * **The charts are drawn in SVG and HTML, with no charting library.** Three reasons, in order of
 * weight. A library would be the largest dependency in the project for five charts. The §10.1
 * bundle budget is measured, and the current bundle is 208 KB. And a `<table>` behind every series
 * is what makes these readable to a screen reader at all — 11.7.5 asks for more than a picture, and
 * a canvas-based chart gives a screen reader nothing whatsoever. The SVG is decorative
 * (`aria-hidden`); the table is the content.
 */
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { ScreenProps } from '../ScreenProps';

/** Mirrors `AnalyticsController.Chart<T>`. */
interface Chart<T> {
  requirement: string;
  points: T;
  sufficient: boolean;
  insufficientReason: string | null;
}

interface DailyPoint {
  date: string;
  value: number;
}

interface CrewLoad {
  /** Null is the unassigned bucket: work that exists and belongs to nobody (8.2.1). */
  crewId: string | null;
  openWorkOrders: number;
}

interface TurnaroundSummary {
  medianHours: number | null;
  sampleSize: number;
  fastestHours: number | null;
  slowestHours: number | null;
}

interface AnalyticsPayload {
  charts: {
    activeCases: Chart<DailyPoint[]>;
    tierDistribution: Chart<Record<string, number>>;
    crewWorkload: Chart<CrewLoad[]>;
    turnaround: Chart<TurnaroundSummary>;
    reportsPerDay: Chart<DailyPoint[]>;
  } | null;
}

export function AnalyticsScreen(props: ScreenProps): JSX.Element {
  const { state, value, retry } = useLoad<AnalyticsPayload>(props.api, '/api/ops/analytics', {
    // `charts: null` is what the route returns when the controller is not wired at all — a
    // different thing from a controller that ran and found nothing, and it gets its own sentence.
    isEmpty: (v) => v.charts === null,
    emptyMessage: 'Analytics are not available on this deployment.',
  });
  const charts = value?.charts ?? null;

  return (
    <section data-screen="Analytics" data-requirement="11.2.26">
      <h1>Analytics</h1>
      <p data-part="window">
        The preceding 30 days. Every figure is computed from stored snapshots, so a chart can only
        be as long as the system has been running.
      </p>

      <StateView state={state} onRetry={retry}>
        {charts === null ? null : (
          <>
            <ChartFrame title="Active cases per day" requirement="7.3.1" chart={charts.activeCases}>
              <Series
                points={charts.activeCases.points}
                valueLabel="Active cases"
                // 7.3.1 omits a day with no snapshots rather than zeroing it, so the series can
                // have gaps. Said here because a reader looking at the table will see them.
                note="Days on which no ingestion cycle succeeded are omitted rather than shown as zero — a missed cycle is not a day on which dengue stopped."
              />
            </ChartFrame>

            <ChartFrame
              title="Clusters by priority tier"
              requirement="7.3.2"
              chart={charts.tierDistribution}
            >
              <Tiers distribution={charts.tierDistribution.points} />
            </ChartFrame>

            <ChartFrame
              title="Open work orders per crew member"
              requirement="7.3.3"
              chart={charts.crewWorkload}
            >
              <Workload loads={charts.crewWorkload.points} />
            </ChartFrame>

            <ChartFrame
              title="Time from raised to verified"
              requirement="7.3.4"
              chart={charts.turnaround}
            >
              <Turnaround summary={charts.turnaround.points} />
            </ChartFrame>

            <ChartFrame title="Reports received per day" requirement="7.3.5" chart={charts.reportsPerDay}>
              <Series
                points={charts.reportsPerDay.points}
                valueLabel="Reports"
                // The opposite convention to 7.3.1, deliberately, and worth saying on the screen
                // where both are visible at once.
                note="A day with no reports is shown as a real zero: nobody reporting anything is a fact about the public, not about the scheduler."
              />
            </ChartFrame>
          </>
        )}
      </StateView>
    </section>
  );
}

/**
 * The frame every chart shares: a heading, the sufficiency statement, and the chart.
 *
 * The statement comes *before* the content in the DOM as well as on the page, so a screen reader
 * meets the caveat before the numbers rather than after them. `role="status"` rather than `alert`:
 * a short history is the expected state of a new deployment, not an error.
 */
function ChartFrame(props: {
  title: string;
  requirement: string;
  chart: Chart<unknown>;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section data-chart={props.requirement} data-sufficient={props.chart.sufficient}>
      <h2>{props.title}</h2>
      {props.chart.sufficient ? null : (
        <p role="status" data-part="insufficient">
          {/* 10.5.3 — the server's own sentence, which names what is missing and how much of it. */}
          <strong>Not yet enough data to read as a trend.</strong>{' '}
          {props.chart.insufficientReason ?? 'The history is too short.'} What is shown below is
          everything there is.
        </p>
      )}
      {props.children}
    </section>
  );
}

/**
 * A daily series, as a sparkline and a table.
 *
 * The y-axis starts at zero and is never truncated. Truncating it is the standard way to make a
 * two-case rise look like an epidemic, and this screen is read by someone deciding where to send a
 * crew tomorrow.
 */
function Series(props: { points: DailyPoint[]; valueLabel: string; note: string }): JSX.Element {
  const points = props.points;
  if (points.length === 0) {
    return <p data-state="empty">No days in this window have any data yet.</p>;
  }

  const max = Math.max(...points.map((p) => p.value), 1);
  const width = 640;
  const height = 120;
  // A single point has no line to draw. Placing it in the middle is honest — the alternative,
  // dividing by zero, puts it at the left edge and implies a series running off to the right.
  const step = points.length === 1 ? 0 : width / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = points.length === 1 ? width / 2 : i * step;
      const y = height - (p.value / max) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <>
      {/* Decorative: everything it conveys is in the table below, which is the accessible copy. */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="presentation"
        aria-hidden="true"
        data-part="sparkline"
        preserveAspectRatio="none"
      >
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <p data-part="note">{props.note}</p>
      <table>
        <caption>
          {props.valueLabel} by day — peak {max} on {peakDay(points)}
        </caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{props.valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{point.date}</th>
              <td>{point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function peakDay(points: DailyPoint[]): string {
  return points.reduce((best, p) => (p.value > best.value ? p : best), points[0] as DailyPoint).date;
}

/** 7.3.2 — the three tiers, in severity order, with the total stated so the parts can be checked. */
function Tiers(props: { distribution: Record<string, number> }): JSX.Element {
  const order = ['High', 'Medium', 'Low'];
  const total = order.reduce((sum, tier) => sum + (props.distribution[tier] ?? 0), 0);
  return (
    <table>
      <caption>Active clusters by tier — {total} in total</caption>
      <thead>
        <tr>
          <th scope="col">Tier</th>
          <th scope="col">Clusters</th>
          <th scope="col">Share</th>
        </tr>
      </thead>
      <tbody>
        {order.map((tier) => {
          const count = props.distribution[tier] ?? 0;
          return (
            <tr key={tier} data-tier={tier}>
              {/* 11.7.5 — the tier is named, not merely coloured. */}
              <th scope="row">{tier}</th>
              <td>{count}</td>
              <td>{total === 0 ? '—' : `${Math.round((count / total) * 100)}%`}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** 7.3.3 — open work per crew member, with the unassigned bucket named rather than hidden. */
function Workload(props: { loads: CrewLoad[] }): JSX.Element {
  if (props.loads.length === 0) {
    return <p data-state="empty">No work orders are open.</p>;
  }
  return (
    <>
      <table>
        <caption>Open work orders</caption>
        <thead>
          <tr>
            <th scope="col">Crew member</th>
            <th scope="col">Open work orders</th>
          </tr>
        </thead>
        <tbody>
          {props.loads.map((load) => (
            <tr key={load.crewId ?? 'unassigned'} data-unassigned={load.crewId === null}>
              {/* 8.2.1 — the row that most needs reading. It is not a crew member's backlog; it is
                  work nobody has been given. */}
              <th scope="row">{load.crewId === null ? 'Not yet assigned' : load.crewId}</th>
              <td>{load.openWorkOrders}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* A stated limitation of the endpoint, repeated here because the omission is invisible: a
          crew member with nothing open simply does not appear, and a manager scanning for someone
          to assign to would otherwise conclude they are not on the roster. */}
      <p data-part="note">
        Crew members with no open work do not appear in this chart. The Staff screen lists everyone.
      </p>
    </>
  );
}

/** 7.3.4 — the median, with the spread beside it so it cannot be read as consistency. */
function Turnaround(props: { summary: TurnaroundSummary }): JSX.Element {
  const s = props.summary;
  if (s.medianHours === null) {
    return <p data-state="empty">No work order has been verified in this window.</p>;
  }
  return (
    <>
      <p data-part="median">
        <strong>{hours(s.medianHours)}</strong> from raised to verified, typically.
      </p>
      {/* The fastest and slowest are not decoration. A median of 30 hours over a 4-to-300 spread
          and a median of 30 hours over a 28-to-32 spread describe different operations, and only
          one of them supports planning. */}
      <p data-part="spread">
        Fastest {hours(s.fastestHours)}, slowest {hours(s.slowestHours)}, over {s.sampleSize}{' '}
        verified work order{s.sampleSize === 1 ? '' : 's'}.
      </p>
    </>
  );
}

/** Hours below a day, days above it. "73.4 hours" is a number nobody converts in their head. */
function hours(value: number | null): string {
  if (value === null) {
    return '—';
  }
  if (value < 24) {
    return `${value.toFixed(1)} hours`;
  }
  const days = value / 24;
  return `${days.toFixed(1)} days`;
}
