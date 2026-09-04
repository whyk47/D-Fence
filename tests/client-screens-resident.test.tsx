/**
 * @vitest-environment jsdom
 *
 * D-Fence — Lab 4 §3.2: the resident screens (§11.2.5–11.2.11).
 *
 * These cases target the places where a screen could look right and be wrong: a limit that has
 * drifted from the server's, a two-step choice collapsed into one, a count incremented locally
 * instead of re-read, and an empty state that says "nothing here" instead of what to do next.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ApiClient, Fetcher } from '../client/src/lib/ApiClient';
import { ScreenProps } from '../client/src/screens/ScreenProps';
import { MyLocationsScreen } from '../client/src/screens/resident/MyLocationsScreen';
import { AddLocationScreen } from '../client/src/screens/resident/AddLocationScreen';
import { ReportSiteScreen } from '../client/src/screens/resident/ReportSiteScreen';
import { MyReportsScreen } from '../client/src/screens/resident/MyReportsScreen';
import { ReportDetailScreen } from '../client/src/screens/resident/ReportDetailScreen';
import { AlertSettingsScreen } from '../client/src/screens/resident/AlertSettingsScreen';
import { ResidentMapScreen } from '../client/src/screens/resident/ResidentMapScreen';
import { MAX_DESCRIPTION_CHARS } from '../src/control/ReportController';
import { MAX_PHOTOS_PER_REPORT } from '../src/entity/ReportPhoto';
import { Role } from '../src/entity/enums';

afterEach(() => cleanup());

/** Routes each requested path to a canned body, and records every call in order. */
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
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => entry.body,
    } as Response;
  };
  return { fetcher, calls };
}

function props(overrides: Partial<ScreenProps> = {}, fetcher?: Fetcher): ScreenProps {
  return {
    api: new ApiClient('', fetcher ?? (async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response)),
    params: {},
    principal: { accountId: 'res-1', role: Role.Resident },
    onNavigate: vi.fn(),
    onPrincipalChange: vi.fn(),
    ...overrides,
  };
}

describe('My Locations — §11.2.6, §3.1.14, §11.4.2, §11.4.6', () => {
  it('M1 — the empty state says what to do, not merely that there is nothing (11.4.2)', async () => {
    const { fetcher } = router({ '/api/locations': { body: { locations: [] } } });
    render(<MyLocationsScreen {...props({}, fetcher)} />);

    await waitFor(() => expect(screen.getByText(/Add your home or workplace/)).toBeTruthy());
  });

  it('M2 — a location inside a cluster is distinguished from one near it (3.1.14)', async () => {
    const { fetcher } = router({
      '/api/locations': {
        body: {
          locations: [
            { id: '1', name: 'Home', label: 'Home', address: 'A', status: 'IN_CLUSTER', cluster: 'Jln Kayu', caseSize: 61, distanceMetres: 0, evaluatedAt: '2026-09-04T01:00:00.000Z' },
            { id: '2', name: 'Office', label: 'Workplace', address: 'B', status: 'NEAR_CLUSTER', cluster: 'Marymount Rd', caseSize: 2, distanceMetres: 184.6, evaluatedAt: '2026-09-04T01:00:00.000Z' },
          ],
        },
      },
    });
    render(<MyLocationsScreen {...props({}, fetcher)} />);

    await waitFor(() => expect(screen.getByText('Inside the Jln Kayu cluster (61 case(s)).')).toBeTruthy());
    // The distance is the fact a resident acts on, so it is stated rather than left to the status.
    expect(screen.getByText('185 m from the Marymount Rd cluster (2 case(s)).')).toBeTruthy();
  });

  it('M3 — an exposure status is always shown with when it was computed (10.5.7)', async () => {
    const { fetcher } = router({
      '/api/locations': {
        body: {
          locations: [
            { id: '1', name: 'Home', label: 'Home', address: 'A', status: 'CLEAR', cluster: null, caseSize: null, distanceMetres: null, evaluatedAt: null },
          ],
        },
      },
    });
    render(<MyLocationsScreen {...props({}, fetcher)} />);

    // Never silently presented as current: an unevaluated location says so.
    await waitFor(() => expect(screen.getByText('Not yet checked against the cluster feed.')).toBeTruthy());
  });

  it('M4 — removal is confirmed first and reports the subscriptions it took with it (11.4.6)', async () => {
    const { fetcher, calls } = router({
      '/api/locations': {
        body: { locations: [{ id: 'loc-1', name: 'Home', label: 'Home', address: 'A', status: 'CLEAR', cluster: null, caseSize: null, distanceMetres: null, evaluatedAt: null }] },
      },
      '/api/locations/loc-1/delete': { body: { deleted: 'loc-1', subscriptionsRemoved: 2 } },
    });
    render(<MyLocationsScreen {...props({}, fetcher)} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove Home' }));
    // Nothing has been sent yet — the dialog is a gate, not a notification.
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('alerts you set up for this location will be removed');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(screen.getByText('Home removed, along with 2 alert subscription(s).')).toBeTruthy());
  });

  it('M5 — dismissing the dialog removes nothing', async () => {
    const { fetcher, calls } = router({
      '/api/locations': {
        body: { locations: [{ id: 'loc-1', name: 'Home', label: 'Home', address: 'A', status: 'CLEAR', cluster: null, caseSize: null, distanceMetres: null, evaluatedAt: null }] },
      },
    });
    render(<MyLocationsScreen {...props({}, fetcher)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });
});

describe('Add Location — §11.2.7, §3.1.4, §3.1.5, §3.1.17', () => {
  it('A1 — the resident chooses among candidates; the first is not taken silently (3.1.4)', async () => {
    const { fetcher, calls } = router({
      '/api/locations/search': {
        body: {
          candidates: [
            { point: { latitude: 1.4, longitude: 103.8 }, address: '117 HO CHING ROAD', postalCode: '610117' },
            { point: { latitude: 1.41, longitude: 103.81 }, address: '119 HO CHING ROAD', postalCode: '610119' },
          ],
        },
      },
      '/api/locations': { status: 201, body: { id: 'loc-9' } },
    });
    const onNavigate = vi.fn();
    render(<AddLocationScreen {...props({ onNavigate }, fetcher)} />);

    fireEvent.change(screen.getByLabelText('Address or postal code'), { target: { value: 'Ho Ching Road' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByText('Which one is it?')).toBeTruthy());
    // Nothing is saved while a choice is outstanding.
    expect(calls.filter((c) => c.url === '/api/locations')).toHaveLength(0);
    expect(screen.queryByLabelText('Name this location')).toBeNull();

    fireEvent.click(screen.getAllByRole('radio')[1] as HTMLElement);
    fireEvent.change(screen.getByLabelText('Name this location'), { target: { value: 'Home' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save location' }));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/locations'));
    const saved = calls.find((c) => c.url === '/api/locations');
    expect((saved?.body as { candidate: { address: string } }).candidate.address).toBe('119 HO CHING ROAD');
  });

  it('A2 — no match is an empty result with a spelling remedy, not an error (3.1.5)', async () => {
    const { fetcher } = router({ '/api/locations/search': { body: { candidates: [] } } });
    render(<AddLocationScreen {...props({}, fetcher)} />);

    fireEvent.change(screen.getByLabelText('Address or postal code'), { target: { value: 'Nowhere At All' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByText(/No match for that address/)).toBeTruthy());
    // A real address that the system cannot find must not be reported as a system failure.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('A3 — an unwell geocoder is an error with a different remedy (3.1.17)', async () => {
    const { fetcher } = router({
      '/api/locations/search': {
        status: 503,
        body: { error: 'the address service is unavailable', remedy: 'try again in a few minutes' },
      },
    });
    render(<AddLocationScreen {...props({}, fetcher)} />);

    fireEvent.change(screen.getByLabelText('Address or postal code'), { target: { value: 'Ho Ching Road' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('try again in a few minutes');
    // Distinct from 3.1.5: this must never tell them their address does not exist.
    expect(screen.queryByText(/No match for that address/)).toBeNull();
  });
});

describe('Report a Site — §11.2.8, §5.1.4–5.1.6', () => {
  it('R1 — the counter uses the server constant, so the two limits cannot drift (5.1.4)', () => {
    render(<ReportSiteScreen {...props()} />);
    fireEvent.change(screen.getByLabelText('Describe what you saw'), { target: { value: 'water' } });
    expect(screen.getByText(`5 / ${MAX_DESCRIPTION_CHARS}`)).toBeTruthy();
  });

  it('R2 — an over-length description is refused before it reaches the network (5.1.4)', async () => {
    const { fetcher, calls } = router({ '/api/reports': { status: 201, body: { reportId: 'r1' } } });
    render(<ReportSiteScreen {...props({}, fetcher)} />);

    fireEvent.change(screen.getByLabelText('Describe what you saw'), {
      target: { value: 'x'.repeat(MAX_DESCRIPTION_CHARS + 1) },
    });
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '1.4' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '103.8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => expect(screen.getByText(`${MAX_DESCRIPTION_CHARS + 1} characters; the limit is ${MAX_DESCRIPTION_CHARS}`)).toBeTruthy());
    expect(calls).toHaveLength(0);
  });

  it('R3 — exactly 500 characters is accepted; the boundary is inclusive (5.1.4)', async () => {
    const { fetcher, calls } = router({ '/api/reports': { status: 201, body: { reportId: 'r1' } } });
    const onNavigate = vi.fn();
    render(<ReportSiteScreen {...props({ onNavigate }, fetcher)} />);

    fireEvent.change(screen.getByLabelText('Describe what you saw'), {
      target: { value: 'x'.repeat(MAX_DESCRIPTION_CHARS) },
    });
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '1.4' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '103.8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => expect(calls.length).toBe(1));
    expect(onNavigate).toHaveBeenCalledWith('/reports/r1');
  });

  it('R4 — an oversized photograph is refused locally, before the upload costs anything (5.1.6)', () => {
    render(<ReportSiteScreen {...props()} />);
    const input = screen.getByLabelText('Add a photograph');
    Object.defineProperty(input, 'files', {
      value: [{ name: 'big.jpg', type: 'image/jpeg', size: 12 * 1024 * 1024 }],
    });
    fireEvent.change(input);

    expect(screen.getByRole('alert').textContent).toContain('12.0 MB; the limit is 5 MB');
  });

  it('R5 — a non-photograph is refused by type (5.1.5)', () => {
    render(<ReportSiteScreen {...props()} />);
    const input = screen.getByLabelText('Add a photograph');
    Object.defineProperty(input, 'files', {
      value: [{ name: 'notes.pdf', type: 'application/pdf', size: 1000 }],
    });
    fireEvent.change(input);

    expect(screen.getByRole('alert').textContent).toContain('only JPEG and PNG photographs are accepted');
  });

  it('R6 — the fourth photograph is refused; the third is not (5.1.5, boundary)', () => {
    render(<ReportSiteScreen {...props()} />);
    const input = screen.getByLabelText('Add a photograph');
    for (let i = 0; i < MAX_PHOTOS_PER_REPORT; i += 1) {
      Object.defineProperty(input, 'files', {
        value: [{ name: `p${i}.jpg`, type: 'image/jpeg', size: 1000 }],
        configurable: true,
      });
      fireEvent.change(input);
    }
    expect(screen.queryByRole('alert')).toBeNull();

    Object.defineProperty(input, 'files', {
      value: [{ name: 'fourth.jpg', type: 'image/jpeg', size: 1000 }],
      configurable: true,
    });
    fireEvent.change(input);
    expect(screen.getByRole('alert').textContent).toContain(`at most ${MAX_PHOTOS_PER_REPORT} photographs`);
  });
});

describe('My Reports and Report Detail — §11.2.9, §11.2.10, §5.1.13, §5.2.x', () => {
  it('D1 — photographs are withheld until the report has been triaged (5.2.x)', async () => {
    const { fetcher } = router({
      '/api/reports/r-1': {
        body: {
          report: { id: 'r-1', type: 'StandingWater', description: 'd', localityBinding: 'L', status: 'Submitted', corroborationCount: 0, submittedAt: '2026-09-04T00:00:00.000Z', photosVisible: false },
          photos: [],
        },
      },
    });
    render(<ReportDetailScreen {...props({ params: { id: 'r-1' } }, fetcher)} />);

    await waitFor(() => expect(screen.getByText('Photographs are shown once the report has been reviewed.')).toBeTruthy());
  });

  it('D2 — a second corroboration is refused as an ordinary sentence, not an error (5.1.13)', async () => {
    const { fetcher } = router({
      '/api/reports/r-1': {
        body: {
          report: { id: 'r-1', type: 'StandingWater', description: 'd', localityBinding: 'L', status: 'Verified', corroborationCount: 3, submittedAt: '2026-09-04T00:00:00.000Z', photosVisible: true },
          photos: [],
        },
      },
      '/api/reports/r-1/corroborate': {
        status: 409,
        body: { error: 'you have already corroborated this report', remedy: 'no action is needed' },
      },
    });
    render(<ReportDetailScreen {...props({ params: { id: 'r-1' } }, fetcher)} />);

    fireEvent.click(await screen.findByRole('button', { name: 'I have seen this too' }));
    const status = await screen.findByText('You have already confirmed this report.');
    // Pressing twice is a normal thing for a person to do; it is not an error state.
    expect(status.getAttribute('role')).toBe('status');
  });

  it('D3 — the count is re-read from the server, never incremented locally (5.1.13)', async () => {
    let count = 3;
    const fetcher: Fetcher = async (url, init) => {
      if (init?.method === 'POST') {
        count += 1;
        return { ok: true, status: 200, json: async () => ({ corroborationCount: count }) } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          report: { id: 'r-1', type: 'StandingWater', description: 'd', localityBinding: 'L', status: 'Verified', corroborationCount: count, submittedAt: '2026-09-04T00:00:00.000Z', photosVisible: true },
          photos: [],
        }),
      } as Response;
    };
    render(<ReportDetailScreen {...props({ params: { id: 'r-1' } }, fetcher)} />);

    await waitFor(() => expect(screen.getByText('3 other resident(s) have confirmed this.')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'I have seen this too' }));
    await waitFor(() => expect(screen.getByText('4 other resident(s) have confirmed this.')).toBeTruthy());
  });

  it('D4 — the reports list links each report to its own URL (11.3.8)', async () => {
    const { fetcher } = router({
      '/api/reports/mine': {
        body: {
          reports: [
            { id: 'r-1', type: 'BlockedDrain', status: 'Verified', submittedAt: '2026-09-04T00:00:00.000Z', locality: 'Jln Kayu', corroborationCount: 2 },
          ],
        },
      },
    });
    render(<MyReportsScreen {...props({}, fetcher)} />);

    const linkEl = await screen.findByRole('link', { name: /BlockedDrain/ });
    expect(linkEl.getAttribute('href')).toBe('/reports/r-1');
  });
});

describe('Alerts and the map — §11.2.11, §11.2.5, §6.1.7, §9.1.11', () => {
  it('T1 — the linking code is shown with its deadline (6.1.7)', async () => {
    const { fetcher } = router({
      '/api/alerts': { body: { alerts: [] } },
      '/api/alerts/link': {
        body: { code: '482913', expiresAt: '2026-09-04T02:15:00.000Z', next: 'send this code to the D-Fence bot' },
      },
    });
    render(<AlertSettingsScreen {...props({}, fetcher)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Request a linking code' }));
    await waitFor(() => expect(screen.getByText('482913')).toBeTruthy());
    // A code with no stated deadline is one somebody returns to tomorrow.
    expect(screen.getByText('This code expires at 02:15 UTC.')).toBeTruthy();
  });

  it('T2 — failed deliveries are shown, not only successful ones (6.2.x)', async () => {
    const { fetcher } = router({
      '/api/alerts': {
        body: {
          alerts: [
            { trigger: 'NewCluster', outcome: 'FAILED', sentAt: '2026-09-03T10:00:00.000Z', attempts: 3, message: 'A cluster has appeared near Home' },
          ],
        },
      },
    });
    render(<AlertSettingsScreen {...props({}, fetcher)} />);

    await waitFor(() => expect(screen.getByText(/FAILED/)).toBeTruthy());
    // Hiding failures would tell a resident their alerts work when the last three never arrived.
    expect(screen.getByText(/after 3 attempts/)).toBeTruthy();
  });

  it('M6 — the map conveys the tier as a label, so it survives without colour (9.1.11, 11.7.5)', async () => {
    const { fetcher } = router({
      '/api/map/layers': {
        body: {
          clusters: [{ clusterId: 'c1', locality: 'Jln Kayu', tier: 'High', tierLabel: 'High priority', caseSize: 61, ring: [] }],
          reports: [],
          workOrders: [],
          savedLocations: [],
        },
      },
    });
    render(<ResidentMapScreen {...props({}, fetcher)} />);

    await waitFor(() => expect(screen.getByText('High priority')).toBeTruthy());
    expect(screen.getByText('61 case(s)')).toBeTruthy();
  });
});
