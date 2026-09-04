/**
 * @vitest-environment jsdom
 *
 * D-Fence — Lab 4 §3.2: the operations and crew screens (§11.2.12–11.2.25).
 *
 * The cases here target the claims that are easy to make and easy to get wrong: that the dashboard
 * displays stored figures rather than recomputing them (7.2.1), that a null count is not a zero,
 * that a degraded score names what was excluded rather than counting it, that a duplicate refusal
 * hands back the order that blocked it (8.1.12), and that the crew screens never make a decision
 * the server is supposed to make.
 *
 * The last describe block guards a route-ordering invariant rather than a screen. It is here
 * because the failure it prevents is silent: `/api/ops/work-orders/crew-workload` registered after
 * `/api/ops/work-orders/:id` would be swallowed by it and answer "no such work order" forever.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ApiClient, Fetcher } from '../client/src/lib/ApiClient';
import { ScreenProps } from '../client/src/screens/ScreenProps';
import { OperationsDashboardScreen } from '../client/src/screens/operations/OperationsDashboardScreen';
import { ModerationQueueScreen } from '../client/src/screens/operations/ModerationQueueScreen';
import { ReportReviewScreen } from '../client/src/screens/operations/ReportReviewScreen';
import { DispatchProposalScreen } from '../client/src/screens/operations/DispatchProposalScreen';
import { ClusterDetailScreen } from '../client/src/screens/operations/ClusterDetailScreen';
import { WorkOrderCreateScreen } from '../client/src/screens/operations/WorkOrderCreateScreen';
import { WorkOrderDetailScreen } from '../client/src/screens/operations/WorkOrderDetailScreen';
import { StaffAccountsScreen } from '../client/src/screens/operations/StaffAccountsScreen';
import { DataSourcesScreen } from '../client/src/screens/operations/DataSourcesScreen';
import { MyJobsScreen } from '../client/src/screens/crew/MyJobsScreen';
import { JobDetailScreen } from '../client/src/screens/crew/JobDetailScreen';
import { JobCompletionScreen } from '../client/src/screens/crew/JobCompletionScreen';
import { WorkOrderRoutes } from '../src/boundary/http/WorkOrderRoutes';
import { screensWithoutComponent, componentsWithoutRoute } from '../client/src/app/ScreenRegistry';
import { Role } from '../src/entity/enums';

afterEach(() => cleanup());

function router(table: Record<string, { status?: number; body: unknown }>): {
  fetcher: Fetcher;
  calls: Array<{ url: string; method: string; body: unknown }>;
} {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body === undefined ? null : JSON.parse(String(init.body)),
    });
    const entry = table[url] ?? { status: 404, body: { error: 'no such route', remedy: 'check the path' } };
    const status = entry.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => entry.body } as Response;
  };
  return { fetcher, calls };
}

function props(overrides: Partial<ScreenProps> = {}, fetcher?: Fetcher): ScreenProps {
  return {
    api: new ApiClient('', fetcher ?? (async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response)),
    params: {},
    principal: { accountId: 'mgr-1', role: Role.OperationsManager },
    onNavigate: vi.fn(),
    onPrincipalChange: vi.fn(),
    ...overrides,
  };
}

const OVERVIEW = {
  activeClusters: 15,
  totalActiveCases: 458,
  highTierClusters: 2,
  openVerifiedReports: null,
  openWorkOrders: 4,
  overdueWorkOrders: 0,
  tierDistribution: { High: 2, Medium: 3, Low: 10 },
  dataAsOf: '2026-09-04T01:35:08.000Z',
  staleSources: [] as string[],
};

describe('Operations Dashboard — §11.2.12, §7.1.x, §7.2.x, §1.4.4', () => {
  it('O1 — an uncountable figure renders as an em dash, never as zero (7.1.x)', async () => {
    const { fetcher } = router({
      '/api/ops/dashboard': { body: { overview: OVERVIEW, attention: [] } },
      '/api/ops/priority': { body: { rows: [] } },
    });
    render(<OperationsDashboardScreen {...props({}, fetcher)} />);

    await waitFor(() => expect(screen.getByText('Open verified reports')).toBeTruthy());
    // "0 open reports" and "we could not count them" are different facts; a manager acts on one.
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('Overdue work orders').previousSibling?.textContent).toBe('0');
  });

  it('O2 — a stale source is announced, not silently reflected in the numbers (1.4.4, 10.5.7)', async () => {
    const { fetcher } = router({
      '/api/ops/dashboard': {
        body: { overview: { ...OVERVIEW, staleSources: ['Rainfall'] }, attention: [] },
      },
      '/api/ops/priority': { body: { rows: [] } },
    });
    render(<OperationsDashboardScreen {...props({}, fetcher)} />);

    const notice = await screen.findByText(/Some figures are out of date/);
    expect(notice.textContent).toContain('Rainfall');
  });

  it('O3 — the data timestamp is the data’s, and its absence is said plainly (7.1.9)', async () => {
    const { fetcher } = router({
      '/api/ops/dashboard': { body: { overview: { ...OVERVIEW, dataAsOf: null }, attention: [] } },
      '/api/ops/priority': { body: { rows: [] } },
    });
    render(<OperationsDashboardScreen {...props({}, fetcher)} />);

    await waitFor(() => expect(screen.getByText('No data has been ingested yet.')).toBeTruthy());
  });

  it('O4 — a degraded row names the excluded drivers rather than counting them (7.2.8, 7.2.9)', async () => {
    const { fetcher } = router({
      '/api/ops/dashboard': { body: { overview: OVERVIEW, attention: [] } },
      '/api/ops/priority': {
        body: {
          rows: [
            {
              rank: 1,
              clusterId: 'c1',
              locality: 'Jln Kayu',
              caseSize: 61,
              caseDelta: 3,
              score: 65.2,
              tier: 'Medium',
              workOrderStatus: null,
              isDegraded: true,
              excludedDrivers: ['Rainfall24h', 'Rainfall72h'],
            },
          ],
        },
      },
    });
    render(<OperationsDashboardScreen {...props({}, fetcher)} />);

    // "2 drivers excluded" would say the score is unreliable; this says how.
    await waitFor(() => expect(screen.getByText(/Rainfall24h, Rainfall72h/)).toBeTruthy());
    // The score is the stored one, printed as given — nothing here recomputes it (7.2.1).
    expect(screen.getByText('65.2')).toBeTruthy();
    expect(screen.getByText('+3')).toBeTruthy();
  });
});

describe('Moderation and review — §11.2.14, §11.2.15, §5.2.4, §5.3.1', () => {
  it('Q1 — the wait is shown in days once it exceeds a day (5.3.1)', async () => {
    const { fetcher } = router({
      '/api/ops/moderation': {
        body: {
          queue: [
            { reportId: 'r1', type: 'StandingWater', description: 'd', localityBinding: 'L', clusterId: null, corroborationCount: 0, submittedAt: '2026-08-26T00:00:00.000Z', photoCount: 2, waitingHours: 216 },
          ],
        },
      },
    });
    render(<ModerationQueueScreen {...props({}, fetcher)} />);

    // A queue of forty is fine; one whose oldest has waited nine days is not.
    await waitFor(() => expect(screen.getByText('Waiting 9 day(s)')).toBeTruthy());
  });

  it('Q2 — the type filter is a query parameter, so the server filters (5.3.5)', async () => {
    const { fetcher, calls } = router({
      '/api/ops/moderation': { body: { queue: [] } },
      '/api/ops/moderation?type=BlockedDrain': { body: { queue: [] } },
    });
    render(<ModerationQueueScreen {...props({}, fetcher)} />);
    fireEvent.change(screen.getByLabelText('Filter by type'), { target: { value: 'BlockedDrain' } });

    await waitFor(() => expect(calls.some((c) => c.url === '/api/ops/moderation?type=BlockedDrain')).toBe(true));
  });

  it('Q3 — rejection requires a reason and is confirmed; verification needs no reason (5.2.3, 5.2.4)', async () => {
    const { fetcher, calls } = router({
      '/api/ops/moderation/r1': {
        body: {
          report: { id: 'r1', type: 'StandingWater', description: 'd', localityBinding: 'L', status: 'Submitted', corroborationCount: 1, submittedAt: '2026-09-01T00:00:00.000Z' },
          photos: [],
        },
      },
      '/api/ops/moderation/r1/reject': { body: { reportId: 'r1', status: 'Rejected' } },
    });
    render(<ReportReviewScreen {...props({ params: { id: 'r1' } }, fetcher)} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    // No reason yet: no dialog, nothing sent.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('Reason for rejection'), { target: { value: 'Not a breeding site' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.getByRole('dialog').textContent).toContain('cannot be undone');

    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[1] as HTMLElement);
    await waitFor(() => expect(calls.some((c) => c.url === '/api/ops/moderation/r1/reject')).toBe(true));
    expect(calls.find((c) => c.url === '/api/ops/moderation/r1/reject')?.body).toEqual({
      reason: 'Not a breeding site',
    });
  });
});

describe('Dispatch, clusters and work orders — §11.2.16, §11.2.13, §11.2.17, §8.1.8, §8.1.12', () => {
  it('W1 — the dispatch list proposes and creates nothing (8.1.8)', async () => {
    const { fetcher, calls } = router({
      '/api/ops/dispatch': {
        body: {
          date: '2026-09-04',
          proposals: [
            { clusterId: 'c1', locality: 'Jln Kayu', score: 65.2, tier: 'Medium', suggestedTaskType: 'Fogging', scheduledDate: '2026-09-04' },
          ],
        },
      },
    });
    render(<DispatchProposalScreen {...props({}, fetcher)} />);

    await waitFor(() => expect(screen.getByText('Dispatch for 2026-09-04')).toBeTruthy());
    // Every row is a link to the form, never a create. There is no "accept all".
    expect(screen.getByRole('link', { name: /Raise a work order for Jln Kayu/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /accept all/i })).toBeNull();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('W2 — the contribution is displayed as stored, not recomputed from its factors (4.1.10)', async () => {
    const { fetcher } = router({
      '/api/map/clusters/c1': {
        body: {
          clusterId: 'c1',
          locality: 'Jln Kayu',
          caseSize: 61,
          score: 65.2,
          tier: 'Medium',
          // 0.97 x 0.30 would be 0.291. The stored value is what a past cycle recorded, and the
          // screen must print that, not a product it computed today.
          breakdown: [{ driver: 'CaseSize', rawValue: 61, normalisedValue: 0.97, weight: 0.3, contribution: 0.35 }],
          isDegraded: false,
          excludedDrivers: [],
          openReports: 0,
          openWorkOrders: [],
          series: [],
          trajectory: 'Rising',
        },
      },
    });
    render(<ClusterDetailScreen {...props({ params: { id: 'c1' } }, fetcher)} />);

    await waitFor(() => expect(screen.getByText('0.35')).toBeTruthy());
    expect(screen.queryByText('0.29')).toBeNull();
  });

  it('W3 — a duplicate refusal offers the order that blocked it (8.1.12)', async () => {
    const { fetcher } = router({
      '/api/ops/work-orders': {
        status: 409,
        body: {
          error: 'an open Fogging work order already exists for this cluster',
          remedy: 'open the existing work order, or cancel it before raising another',
          existing: { id: 'wo-7', taskType: 'Fogging', status: 'Assigned', scheduledDate: '2026-09-05' },
        },
      },
    });
    render(<WorkOrderCreateScreen {...props({}, fetcher)} />);

    fireEvent.change(screen.getByLabelText('Cluster'), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText('Scheduled date'), { target: { value: '2026-09-04' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create work order' }));

    // A 409 that only said "duplicate" would send the manager to search a list for something the
    // system already had in its hand.
    const linkEl = await screen.findByRole('link', { name: /Open the existing Fogging order/ });
    expect(linkEl.getAttribute('href')).toBe('/ops/work-orders/wo-7');
  });

  it('W4 — the crew list shows each member’s open load beside their name (8.2.5)', async () => {
    const { fetcher } = router({
      '/api/ops/work-orders/wo-1': {
        body: {
          workOrder: { id: 'wo-1', clusterId: 'c1', assigneeId: null, taskType: 'Fogging', status: 'Created', scheduledDate: '2026-09-04', priority: 'High', instructions: 'i', issueFlag: false, issueReason: null, cancellationReason: null, verifiedAt: null },
        },
      },
      '/api/ops/work-orders/crew-workload': {
        body: {
          crew: [
            { crewId: 'cr-1', email: 'ah.seng@example.com', isActive: true, openWorkOrders: 5 },
            { crewId: 'cr-2', email: 'siti@example.com', isActive: true, openWorkOrders: 0 },
          ],
        },
      },
    });
    render(<WorkOrderDetailScreen {...props({ params: { id: 'wo-1' } }, fetcher)} />);

    // Assigning without the load is assigning blind.
    await waitFor(() => expect(screen.getByText('ah.seng@example.com — 5 open')).toBeTruthy());
    expect(screen.getByText('siti@example.com — 0 open')).toBeTruthy();
  });

  it('W5 — a refused transition shows the state the order is actually in (8.3.16)', async () => {
    const { fetcher } = router({
      '/api/ops/work-orders/wo-1': {
        body: {
          workOrder: { id: 'wo-1', clusterId: 'c1', assigneeId: 'cr-1', taskType: 'Fogging', status: 'InProgress', scheduledDate: '2026-09-04', priority: 'High', instructions: 'i', issueFlag: false, issueReason: null, cancellationReason: null, verifiedAt: null },
        },
      },
      '/api/ops/work-orders/crew-workload': { body: { crew: [] } },
      '/api/ops/work-orders/wo-1/verify': {
        status: 422,
        body: { error: 'InProgress → Verified is not a permitted transition', remedy: 'the work order is InProgress' },
      },
    });
    render(<WorkOrderDetailScreen {...props({ params: { id: 'wo-1' } }, fetcher)} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Verify completion' }));
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    const alert = await screen.findByRole('alert');
    // "Cannot verify" alone is useless; the state is what tells the manager what to do next.
    expect(alert.textContent).toContain('the work order is InProgress');
  });
});

describe('Staff and sources — §11.2.22, §11.2.23, §2.2.5, §1.4.3, §1.4.4', () => {
  it('S1 — deactivation warns about the sessions it ends, then reports how many (2.2.5)', async () => {
    const { fetcher } = router({
      '/api/ops/staff': { body: { staff: [{ id: 'a1', email: 'ah.seng@example.com', role: 'CleaningCrew', isActive: true }] } },
      '/api/ops/staff/a1/deactivate': { body: { id: 'a1', isActive: false, sessionsEnded: 2 } },
    });
    render(<StaffAccountsScreen {...props({}, fetcher)} />);

    fireEvent.click(await screen.findByRole('button', { name: /Deactivate ah.seng@example.com/ }));
    expect(screen.getByRole('dialog').textContent).toContain('even if they are recording work right now');

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(screen.getByText('ah.seng@example.com deactivated; 2 session(s) ended.')).toBeTruthy());
  });

  it('S2 — a deactivated account stays listed, marked, because it is not deleted (2.2.6)', async () => {
    const { fetcher } = router({
      '/api/ops/staff': { body: { staff: [{ id: 'a1', email: 'gone@example.com', role: 'CleaningCrew', isActive: false }] } },
    });
    render(<StaffAccountsScreen {...props({}, fetcher)} />);

    await waitFor(() => expect(screen.getByText('Deactivated')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Reactivate gone@example.com/ })).toBeTruthy();
  });

  it('S3 — warning and stale are distinct states with distinct sentences (1.4.3, 1.4.4)', async () => {
    const { fetcher } = router({
      '/api/ops/sources': {
        body: {
          sources: [
            { source: 'Clusters', lastSuccessAt: '2026-09-04T01:00:00.000Z', isWarning: false, isStale: false },
            { source: 'Rainfall', lastSuccessAt: '2026-09-04T00:00:00.000Z', isWarning: false, isStale: true },
            { source: 'Forecast', lastSuccessAt: null, isWarning: true, isStale: true },
          ],
        },
      },
    });
    render(<DataSourcesScreen {...props({}, fetcher)} />);

    await waitFor(() => expect(screen.getByText('Healthy.')).toBeTruthy());
    // One missed cycle marks the data; three failures raise an alarm. Collapsing them would either
    // cry wolf on every cycle or stay silent through a dead feed.
    expect(screen.getByText(/Stale — the data is older than one cycle/)).toBeTruthy();
    expect(screen.getByText('Failing — this source has never succeeded.')).toBeTruthy();
    // 1.4.1 — "never" is not rendered as a very old date.
    expect(screen.getByText('Never')).toBeTruthy();
  });
});

describe('Crew screens — §11.2.19–11.2.21, §8.3.x, §8.4.1', () => {
  it('C1 — the filter goes to the server, not to a filter over everything (8.4.1)', async () => {
    const { fetcher, calls } = router({
      '/api/crew/work-orders?filter=Today': { body: { filter: 'Today', workOrders: [] } },
      '/api/crew/work-orders?filter=Completed': { body: { filter: 'Completed', workOrders: [] } },
    });
    render(<MyJobsScreen {...props({ principal: { accountId: 'cr-1', role: Role.CleaningCrew } }, fetcher)} />);

    await waitFor(() => expect(calls.some((c) => c.url === '/api/crew/work-orders?filter=Today')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/crew/work-orders?filter=Completed')).toBe(true));
  });

  it('C2 — jobs render in the order the server returned; the screen re-sorts nothing (8.4.2)', async () => {
    const { fetcher } = router({
      '/api/crew/work-orders?filter=Today': {
        body: {
          filter: 'Today',
          workOrders: [
            { id: 'w1', taskType: 'Larviciding', status: 'Assigned', scheduledDate: '2026-09-04', priority: 'Low', issueFlag: false },
            { id: 'w2', taskType: 'Fogging', status: 'Assigned', scheduledDate: '2026-09-04', priority: 'High', issueFlag: false },
          ],
        },
      },
    });
    render(<MyJobsScreen {...props({ principal: { accountId: 'cr-1', role: Role.CleaningCrew } }, fetcher)} />);

    // A second sort here would silently win over the one 8.4.2 names, and the two would drift.
    const items = await screen.findAllByRole('listitem');
    expect(items[0]?.textContent).toContain('Larviciding');
    expect(items[1]?.textContent).toContain('Fogging');
  });

  it('C3 — an issue with no reason is not sent (8.3.8)', async () => {
    const { fetcher, calls } = router({
      '/api/crew/work-orders/w1': {
        body: {
          workOrder: { id: 'w1', clusterId: 'c1', taskType: 'Fogging', status: 'InProgress', scheduledDate: '2026-09-04', priority: 'High', instructions: 'i', startedAt: null, issueFlag: false, issueReason: null },
        },
      },
    });
    render(<JobDetailScreen {...props({ params: { id: 'w1' }, principal: { accountId: 'cr-1', role: Role.CleaningCrew } }, fetcher)} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Raise an issue' }));
    await waitFor(() => expect(screen.getByText('Reason is required')).toBeTruthy());
    // An issue with no reason stops the work and tells nobody why.
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('C4 — the action offered follows the status (8.3.3, 8.3.4)', async () => {
    const { fetcher } = router({
      '/api/crew/work-orders/w1': {
        body: {
          workOrder: { id: 'w1', clusterId: 'c1', taskType: 'Fogging', status: 'Assigned', scheduledDate: '2026-09-04', priority: 'High', instructions: 'i', startedAt: null, issueFlag: false, issueReason: null },
        },
      },
    });
    render(<JobDetailScreen {...props({ params: { id: 'w1' }, principal: { accountId: 'cr-1', role: Role.CleaningCrew } }, fetcher)} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept this job' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Start work' })).toBeNull();
  });

  it('C5 — completion states the photograph requirement before submission, not after (8.3.10)', async () => {
    const { fetcher, calls } = router({
      '/api/crew/work-orders/w1': {
        body: { workOrder: { id: 'w1', taskType: 'Fogging', status: 'InProgress', instructions: 'i' } },
      },
      '/api/crew/work-orders/w1/complete': { body: { id: 'w1', status: 'Completed' } },
    });
    render(<JobCompletionScreen {...props({ params: { id: 'w1' }, principal: { accountId: 'cr-1', role: Role.CleaningCrew } }, fetcher)} />);

    await waitFor(() => expect(screen.getByText('At least one photograph is required.')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('What did you do?'), { target: { value: 'Fogged the drains' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit completion' }));
    // Refused locally: this screen is used standing in a drain, and a second trip is expensive.
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    const input = screen.getByLabelText('Add a photograph');
    Object.defineProperty(input, 'files', { value: [{ name: 'after.jpg' }], configurable: true });
    fireEvent.change(input);
    fireEvent.click(screen.getByRole('button', { name: 'Submit completion' }));

    await waitFor(() => expect(calls.some((c) => c.url === '/api/crew/work-orders/w1/complete')).toBe(true));
    expect(calls.find((c) => c.url === '/api/crew/work-orders/w1/complete')?.body).toEqual({
      notes: 'Fogged the drains',
      photoKeys: ['after.jpg'],
    });
  });

  it('C6 — the task performed is not an editable field (8.3.7)', async () => {
    const { fetcher } = router({
      '/api/crew/work-orders/w1': {
        body: { workOrder: { id: 'w1', taskType: 'Larviciding', status: 'InProgress', instructions: 'i' } },
      },
    });
    render(<JobCompletionScreen {...props({ params: { id: 'w1' }, principal: { accountId: 'cr-1', role: Role.CleaningCrew } }, fetcher)} />);

    // Shown, so the crew member knows what is being recorded; not editable, so they cannot record
    // having done something nobody asked for.
    await waitFor(() => expect(screen.getByText('Task performed: Larviciding')).toBeTruthy());
    expect(screen.queryByLabelText(/task/i)).toBeNull();
  });
});

describe('Route registration order — §8.2.5', () => {
  it('X1 — the literal crew-workload path is registered before the :id pattern', () => {
    // Express matches in registration order, so `/api/ops/work-orders/:id` registered first would
    // swallow `/api/ops/work-orders/crew-workload` and answer "no such work order" forever. The
    // ordering is load-bearing and invisible, so it is asserted rather than trusted.
    const paths = new WorkOrderRoutes(
      null as never,
      null as never,
      null as never,
      null as never,
    ).routes();
    expect(paths.indexOf('/api/ops/work-orders/crew-workload')).toBeLessThan(
      paths.indexOf('/api/ops/work-orders/:id'),
    );
  });
});

describe('Screen registry — §11.3.1, §11.3.2', () => {
  it('X2 — every served route has a component behind it (11.3.1)', () => {
    // A route the guard allows with no component renders a blank page: a screen the dialog map
    // draws, the router serves, and nobody built. The only symptom is empty space, so it is
    // asserted here rather than left to be noticed.
    expect(screensWithoutComponent()).toEqual([]);
  });

  it('X3 — every registered component is reachable by some route', () => {
    expect(componentsWithoutRoute()).toEqual([]);
  });
});
