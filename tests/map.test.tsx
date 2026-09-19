/**
 * @vitest-environment jsdom
 *
 * D-Fence — Lab 4: the drawn map (§9.1).
 *
 * §9.1 was previously satisfied by a list, and the tests that covered it tested the list. Drawing
 * the clusters does not retire any of those obligations; it adds a second surface that has to carry
 * the same guarantees. That is what this file is about.
 *
 * **What is deliberately not asserted: pixels.** Leaflet renders to a canvas inside an element that
 * jsdom never lays out, so no test here can prove a polygon is in the right place — and one that
 * mocked Leaflet to claim it did would prove only that the mock was written to agree. What IS
 * assertable, and is what the requirements actually demand, is everything around the drawing: that
 * the tier survives without colour (9.1.11), that a layer can be hidden (9.1.6), that the map is
 * reachable by keyboard (11.7.2), that the source is attributed (10.4.5), and that the textual
 * record is still there when the drawing is not (11.7.5).
 *
 * The one place the drawing itself is checked is the browser: `demo-drive.ts` counts the loaded
 * tiles and the rendered paths against the deployment, which is the only honest way to assert it.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SingaporeMap, MapCluster, MapMarker, ONEMAP_ATTRIBUTION } from '../client/src/components/SingaporeMap';
import { ApiClient, Fetcher } from '../client/src/lib/ApiClient';
import { ScreenProps } from '../client/src/screens/ScreenProps';
import { ResidentMapScreen } from '../client/src/screens/resident/ResidentMapScreen';
import { OperationsDashboardScreen } from '../client/src/screens/operations/OperationsDashboardScreen';
import { Role } from '../src/entity/enums';

afterEach(() => cleanup());

function router(table: Record<string, { status?: number; body: unknown }>): Fetcher {
  return async (url) => {
    const entry = table[url] ?? { status: 404, body: { error: 'no such route', remedy: 'check the path' } };
    const status = entry.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => entry.body } as Response;
  };
}

function props(role: Role, fetcher: Fetcher): ScreenProps {
  return {
    api: new ApiClient('', fetcher),
    params: {},
    principal: { accountId: 'a-1', role },
    onNavigate: vi.fn(),
    onPrincipalChange: vi.fn(),
  };
}

/** A square kilometre or so of Ang Mo Kio, as a ring in GeoJSON order — [lng, lat]. */
const RING: Array<[number, number]> = [
  [103.845, 1.372],
  [103.852, 1.372],
  [103.852, 1.379],
  [103.845, 1.379],
  [103.845, 1.372],
];

const CLUSTERS: MapCluster[] = [
  { clusterId: 'c-high', locality: 'Jln Kayu', tier: 'High', tierLabel: 'High priority', caseSize: 61, ring: RING },
  { clusterId: 'c-low', locality: 'Marymount Rd', tier: 'Low', tierLabel: 'Low priority', caseSize: 2, ring: RING },
];

const MARKERS: MapMarker[] = [
  { id: 'r-1', latitude: 1.375, longitude: 103.848, title: 'StandingWater', detail: 'Report — Verified', kind: 'report' },
  { id: 'l-1', latitude: 1.376, longitude: 103.849, title: 'Home', detail: 'Your location — CLEAR', kind: 'savedLocation' },
];

describe('The drawn map — §9.1, §10.4.5, §11.7', () => {
  it('N1 — the map is an application region, keyboard-operable, and says what it contains (11.7.2)', () => {
    render(<SingaporeMap label="test-map" clusters={CLUSTERS} />);

    const region = screen.getByRole('application');
    // Not `role="img"`: the arrow keys pan it and +/- zoom it, and calling it an image would tell
    // a screen reader there is nothing to operate.
    expect(region.getAttribute('aria-label')).toContain('2 cluster(s)');
    expect(region.getAttribute('aria-label')).toContain('Arrow keys pan');
  });

  it('N2 — every tier present is named in words in the legend (9.1.11, 11.7.5)', () => {
    render(<SingaporeMap label="test-map" clusters={CLUSTERS} />);

    // The fill is an addition to this, never a substitute for it. Remove the stylesheet and the
    // key still reads "High priority" and "Low priority".
    expect(document.querySelector('.map-key[data-tier="High"]')?.textContent).toContain('High priority');
    expect(document.querySelector('.map-key[data-tier="Low"]')?.textContent).toContain('Low priority');
  });

  it('N3 — the basemap is attributed in the page itself, not only inside the canvas (10.4.5)', () => {
    render(<SingaporeMap label="test-map" clusters={CLUSTERS} />);

    // Leaflet draws its own attribution control, which disappears with the drawing. 10.4.5 is an
    // obligation about the data we present, so the statement is also in the screen's own text.
    expect(screen.getByText(/OneMap © Singapore Land Authority/)).toBeTruthy();
    expect(ONEMAP_ATTRIBUTION).toContain('Singapore Land Authority');
  });

  it('N4 — a layer switch appears only for a layer this caller actually received (9.1.6, 2.3.x)', () => {
    render(<SingaporeMap label="test-map" clusters={CLUSTERS} markers={MARKERS} />);

    expect(screen.getByLabelText('Reports')).toBeTruthy();
    expect(screen.getByLabelText('My locations')).toBeTruthy();
    // No work-order marker was supplied, because the server did not send one to this principal.
    // Offering the switch anyway would advertise a layer they are not permitted to see.
    expect(screen.queryByLabelText('Work orders')).toBeNull();
  });

  it('N5 — a layer can be hidden and shown again (9.1.6)', () => {
    render(<SingaporeMap label="test-map" clusters={CLUSTERS} markers={MARKERS} />);

    const reports = screen.getByLabelText('Reports') as HTMLInputElement;
    expect(reports.checked).toBe(true);
    fireEvent.click(reports);
    expect(reports.checked).toBe(false);
    fireEvent.click(reports);
    expect(reports.checked).toBe(true);
  });

  it('N6 — with no geometry at all the legend says so rather than showing an empty key', () => {
    render(<SingaporeMap label="test-map" clusters={[]} />);

    expect(screen.getByText('No cluster boundaries to draw.')).toBeTruthy();
    expect(document.querySelector('.map-key')).toBeNull();
  });
});

describe('The map on a screen — §11.2.5, §11.2.12', () => {
  it('N7 — the resident keeps the textual record beneath the drawing (11.7.5)', async () => {
    const fetcher = router({
      '/api/map/layers': {
        body: {
          clusters: [CLUSTERS[0]],
          reports: [],
          savedLocations: [
            { savedLocationId: 'l-1', label: 'Home', exposureStatus: 'CLEAR', latitude: 1.376, longitude: 103.849 },
          ],
        },
      },
    });
    render(<ResidentMapScreen {...props(Role.Resident, fetcher)} />);

    // Both surfaces, from one payload: the map region AND the list entry that survives without it.
    await waitFor(() => expect(document.querySelector('[data-part="resident-map"]')).toBeTruthy());
    expect(document.querySelector('[data-part="tier"]')?.textContent).toBe('High priority');
    expect(screen.getByText('61 case(s)')).toBeTruthy();
    // 9.1.5 — the saved location is rendered from `label`/`exposureStatus`, the field names the
    // server actually sends. It used to read `name`/`status`, which no payload has ever carried,
    // so every saved location rendered as " — " on this screen.
    expect(screen.getByText('Home')).toBeTruthy();
    // Was `Home — CLEAR`. `CLEAR` is the `ExposureStatus` member name, and it was the answer a
    // resident got to the only question this screen exists to answer. Asserted in its new words so
    // the case still fails if the identifier leaks back.
    expect(screen.getByText('No cluster nearby')).toBeTruthy();
  });

  it('N8 — a long report list is capped, and says that it was (11.6.x)', async () => {
    const reports = Array.from({ length: 30 }, (_, i) => ({
      reportId: `r-${i}`,
      type: 'StandingWater',
      status: 'Verified',
      latitude: 1.375,
      longitude: 103.848,
    }));
    const fetcher = router({
      '/api/map/layers': { body: { clusters: [CLUSTERS[0]], reports, savedLocations: [] } },
    });
    render(<ResidentMapScreen {...props(Role.Resident, fetcher)} />);

    // Thirty identical lines is the same information as ten, made unreadable. The omission is
    // stated rather than silent, and the map above still carries all thirty.
    await waitFor(() => expect(screen.getByText(/Showing 10 of 30 reports/)).toBeTruthy());
    expect(document.querySelectorAll('[data-part="reports"] li')).toHaveLength(10);
  });

  it('N9 — the manager gets the map above the priority table, with both marker layers', async () => {
    const fetcher = router({
      '/api/ops/dashboard': {
        body: {
          overview: {
            activeClusters: 2,
            totalActiveCases: 63,
            highTierClusters: 1,
            openVerifiedReports: 1,
            openWorkOrders: 1,
            overdueWorkOrders: 0,
            tierDistribution: {},
            dataAsOf: '2026-09-05T07:00:00.000Z',
            staleSources: [],
          },
          attention: [],
        },
      },
      '/api/ops/priority': { body: { rows: [] } },
      '/api/map/layers': {
        body: {
          clusters: CLUSTERS,
          reports: [{ reportId: 'r-1', latitude: 1.375, longitude: 103.848, status: 'Verified', type: 'StandingWater' }],
          workOrders: [
            { workOrderId: 'w-1', latitude: 1.377, longitude: 103.85, status: 'Assigned', taskType: 'Fogging' },
          ],
          savedLocations: [],
        },
      },
    });
    render(<OperationsDashboardScreen {...props(Role.OperationsManager, fetcher)} />);

    await waitFor(() => expect(document.querySelector('[data-part="ops-map"]')).toBeTruthy());
    // 9.1.4 — a manager sees work orders, so the switch for them exists here and not on the
    // resident's screen.
    expect(screen.getByLabelText('Work orders')).toBeTruthy();
    expect(screen.getByLabelText('Reports')).toBeTruthy();
  });

  it('N10 — an attention item shows its detail and the place it is resolved (7.5.2, 7.5.4)', async () => {
    const fetcher = router({
      '/api/ops/dashboard': {
        body: {
          overview: {
            activeClusters: 0,
            totalActiveCases: 0,
            highTierClusters: 0,
            openVerifiedReports: 0,
            openWorkOrders: 0,
            overdueWorkOrders: 0,
            tierDistribution: {},
            dataAsOf: null,
            staleSources: [],
          },
          attention: [
            {
              kind: 'reportAwaitingModeration',
              detail: '19 report(s) awaiting moderation; the oldest has waited 32 hour(s)',
              link: '/ops/moderation',
            },
          ],
        },
      },
      '/api/ops/priority': { body: { rows: [] } },
      '/api/map/layers': { body: { clusters: [], reports: [], workOrders: [], savedLocations: [] } },
    });
    render(<OperationsDashboardScreen {...props(Role.OperationsManager, fetcher)} />);

    // The regression this case exists for: the screen read `item.message`, the server has always
    // sent `detail`, and so the panel that exists to say what needs a decision today rendered one
    // empty bullet per decision — in production, looking exactly like a panel with nothing to say.
    await waitFor(() =>
      expect(screen.getByText(/19 report\(s\) awaiting moderation/)).toBeTruthy(),
    );
    const open = document.querySelector('[data-part="attention-list"] a');
    expect(open?.getAttribute('href')).toBe('/ops/moderation');
  });
});
