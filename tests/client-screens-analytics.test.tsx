/**
 * @vitest-environment jsdom
 *
 * D-Fence — Lab 4 §3.2: the Analytics screen (§11.2.26, §7.3.1–7.3.5).
 *
 * `AnalyticsController` built all five §7.3 charts and `GET /api/ops/analytics` returned all five,
 * and no screen rendered any of them — the endpoint answered correctly to nobody. These cases
 * check the display, and they are weighted almost entirely towards **one** property: that a chart
 * the server marked insufficient says so, in words, where the reader cannot miss it.
 *
 * That is not fastidiousness about wording. The controller's own header makes the argument: a
 * 30-day series drawn from three days of snapshots is a flat line, and a flat line is the claim
 * "cases are steady". A median over one work order is that work order. The number is right in both
 * cases; the reading is wrong, and only the caveat prevents it. So a screen that dropped
 * `insufficientReason` would pass any test that checked the arithmetic and would still be the
 * defect this feature exists to avoid.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ApiClient, Fetcher } from '../client/src/lib/ApiClient';
import { ScreenProps } from '../client/src/screens/ScreenProps';
import { AnalyticsScreen } from '../client/src/screens/operations/AnalyticsScreen';
import { Role } from '../src/entity/enums';

afterEach(() => cleanup());

function chart<T>(points: T, insufficientReason: string | null = null): {
  requirement: string;
  points: T;
  sufficient: boolean;
  insufficientReason: string | null;
} {
  return {
    requirement: '7.3.x',
    points,
    sufficient: insufficientReason === null,
    insufficientReason,
  };
}

const CHARTS = {
  activeCases: chart([
    { date: '2026-09-01', value: 440 },
    { date: '2026-09-02', value: 455 },
    { date: '2026-09-03', value: 451 },
  ]),
  tierDistribution: chart({ High: 1, Medium: 4, Low: 11 }),
  crewWorkload: chart([
    { crewId: 'crew-1', openWorkOrders: 3 },
    { crewId: null, openWorkOrders: 2 },
  ]),
  turnaround: chart({ medianHours: 30, sampleSize: 9, fastestHours: 4, slowestHours: 300 }),
  reportsPerDay: chart([
    { date: '2026-09-02', value: 0 },
    { date: '2026-09-03', value: 6 },
  ]),
};

function props(body: unknown, status = 200): ScreenProps {
  const fetcher: Fetcher = async () =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
  return {
    api: new ApiClient('', fetcher),
    params: {},
    principal: { accountId: 'mgr-1', role: Role.OperationsManager },
    onNavigate: vi.fn(),
    onPrincipalChange: vi.fn(),
  };
}

describe('Analytics screen — §11.2.26, §7.3.1–7.3.5', () => {
  it('N1 — all five §7.3 charts are rendered, each labelled with its requirement', async () => {
    render(<AnalyticsScreen {...props({ charts: CHARTS })} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Active cases per day' })).toBeTruthy());

    // The failure this catches is a screen that renders four of the five and looks complete.
    for (const requirement of ['7.3.1', '7.3.2', '7.3.3', '7.3.4', '7.3.5']) {
      expect(document.querySelector(`[data-chart="${requirement}"]`)).toBeTruthy();
    }
  });

  it('N2 — an insufficient chart says so in words, and says what is missing', async () => {
    const short = {
      ...CHARTS,
      activeCases: chart(
        [{ date: '2026-09-03', value: 451 }],
        '1 of 7 days of cluster history — too little to read as a trend',
      ),
    };
    render(<AnalyticsScreen {...props({ charts: short })} />);
    await waitFor(() => expect(document.querySelector('[data-chart="7.3.1"]')).toBeTruthy());

    const frame = document.querySelector('[data-chart="7.3.1"]') as HTMLElement;
    expect(frame.getAttribute('data-sufficient')).toBe('false');
    // 10.5.3 — the server's own sentence, reproduced rather than replaced with a generic one.
    expect(frame.textContent).toContain('1 of 7 days of cluster history');
    expect(frame.textContent).toContain('Not yet enough data to read as a trend');
  });

  it('N3 — the caveat precedes the numbers in the DOM, not only on the page', async () => {
    // A screen reader meets the document in order. A caveat rendered after the table is a caveat
    // read after the conclusion has already been drawn.
    const short = { ...CHARTS, activeCases: chart([{ date: '2026-09-03', value: 451 }], '1 of 7 days') };
    render(<AnalyticsScreen {...props({ charts: short })} />);
    await waitFor(() => expect(document.querySelector('[data-chart="7.3.1"]')).toBeTruthy());

    const frame = document.querySelector('[data-chart="7.3.1"]') as HTMLElement;
    const caveat = frame.querySelector('[data-part="insufficient"]') as Node;
    const table = frame.querySelector('table') as Node;
    // DOCUMENT_POSITION_FOLLOWING: the table comes after the caveat.
    expect(caveat.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('N4 — a sufficient chart carries no caveat at all', async () => {
    render(<AnalyticsScreen {...props({ charts: CHARTS })} />);
    await waitFor(() => expect(document.querySelector('[data-chart="7.3.2"]')).toBeTruthy());

    const frame = document.querySelector('[data-chart="7.3.2"]') as HTMLElement;
    expect(frame.getAttribute('data-sufficient')).toBe('true');
    // Crying wolf on a chart that is fine teaches the reader to skip the ones that are not.
    expect(frame.querySelector('[data-part="insufficient"]')).toBeNull();
  });

  it('N5 — every series is a table as well as a picture (11.7.5)', async () => {
    render(<AnalyticsScreen {...props({ charts: CHARTS })} />);
    await waitFor(() => expect(document.querySelector('[data-chart="7.3.1"]')).toBeTruthy());

    const frame = document.querySelector('[data-chart="7.3.1"]') as HTMLElement;
    const rows = frame.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('2026-09-01');
    expect(rows[0]?.textContent).toContain('440');
    // The drawing conveys nothing a screen reader can use, so it must not claim to.
    const svg = frame.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('N6 — the tier totals are shown so the parts can be checked against them', async () => {
    render(<AnalyticsScreen {...props({ charts: CHARTS })} />);
    await waitFor(() => expect(document.querySelector('[data-chart="7.3.2"]')).toBeTruthy());

    const frame = document.querySelector('[data-chart="7.3.2"]') as HTMLElement;
    // 1 + 4 + 11. A caption that disagrees with the rows is how the 1,375-vs-465 defect was
    // visible on the dashboard for a day before anyone added them up.
    expect(frame.querySelector('caption')?.textContent).toContain('16 in total');
    expect(frame.textContent).toContain('High');
    expect(frame.textContent).toContain('69%'); // Low: 11/16
  });

  it('N7 — the unassigned bucket is named, not left blank (8.2.1)', async () => {
    render(<AnalyticsScreen {...props({ charts: CHARTS })} />);
    await waitFor(() => expect(document.querySelector('[data-chart="7.3.3"]')).toBeTruthy());

    const frame = document.querySelector('[data-chart="7.3.3"]') as HTMLElement;
    // Work that belongs to nobody is the row a workload chart most needs to show.
    expect(frame.textContent).toContain('Not yet assigned');
    expect(frame.querySelector('[data-unassigned="true"]')).toBeTruthy();
    // And the omission that is otherwise invisible: crew with nothing open are simply absent.
    expect(frame.textContent).toContain('Crew members with no open work do not appear');
  });

  it('N8 — the turnaround median is shown with its spread, never alone', async () => {
    render(<AnalyticsScreen {...props({ charts: CHARTS })} />);
    await waitFor(() => expect(document.querySelector('[data-chart="7.3.4"]')).toBeTruthy());

    const frame = document.querySelector('[data-chart="7.3.4"]') as HTMLElement;
    expect(frame.textContent).toContain('1.3 days'); // 30 h, in a unit a reader can hold
    // 4 h to 300 h around a median of 30 h is not a consistent operation, and a median printed on
    // its own would read as though it were.
    expect(frame.textContent).toContain('4.0 hours');
    expect(frame.textContent).toContain('12.5 days');
    expect(frame.textContent).toContain('9 verified work orders');
  });

  it('N9 — a day with no reports is a zero row, not a missing one (7.3.5)', async () => {
    render(<AnalyticsScreen {...props({ charts: CHARTS })} />);
    await waitFor(() => expect(document.querySelector('[data-chart="7.3.5"]')).toBeTruthy());

    const frame = document.querySelector('[data-chart="7.3.5"]') as HTMLElement;
    expect(frame.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(frame.textContent).toContain('2026-09-02');
    // The two series use opposite conventions on purpose, and the screen says which is which.
    expect(frame.textContent).toContain('real zero');
  });

  it('N10 — a controller that is not wired reads as unavailable, not as an empty dashboard', async () => {
    render(<AnalyticsScreen {...props({ charts: null })} />);
    await waitFor(() =>
      expect(screen.getByText('Analytics are not available on this deployment.')).toBeTruthy(),
    );
    // Zeroes in every chart would be a claim about Singapore. This is a claim about the server.
    expect(document.querySelector('[data-chart="7.3.2"]')).toBeNull();
  });

  it('N11 — a failed request offers a retry (11.4.4)', async () => {
    render(
      <AnalyticsScreen
        {...props({ error: 'the analytics could not be built', remedy: 'try again shortly' }, 500)}
      />,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('the analytics could not be built');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('N12 — a single-point series does not divide by zero', async () => {
    // The first day of a new deployment, which is when this screen is most likely to be opened.
    const one = { ...CHARTS, activeCases: chart([{ date: '2026-09-03', value: 451 }], '1 of 7 days') };
    render(<AnalyticsScreen {...props({ charts: one })} />);
    await waitFor(() => expect(document.querySelector('[data-chart="7.3.1"]')).toBeTruthy());

    const path = document.querySelector('[data-chart="7.3.1"] path')?.getAttribute('d') ?? '';
    expect(path).not.toContain('NaN');
    expect(path).not.toContain('Infinity');
  });

  it('N13 — an all-zero series does not divide by zero either', async () => {
    const flat = {
      ...CHARTS,
      reportsPerDay: chart([
        { date: '2026-09-02', value: 0 },
        { date: '2026-09-03', value: 0 },
      ]),
    };
    render(<AnalyticsScreen {...props({ charts: flat })} />);
    await waitFor(() => expect(document.querySelector('[data-chart="7.3.5"]')).toBeTruthy());

    const path = document.querySelector('[data-chart="7.3.5"] path')?.getAttribute('d') ?? '';
    expect(path).not.toContain('NaN');
  });
});
