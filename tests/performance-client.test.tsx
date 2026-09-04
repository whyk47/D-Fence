/**
 * @vitest-environment jsdom
 *
 * D-Fence — Lab 4 §3.2 and US-0.5: the two §10.1 obligations that needed the client to exist.
 *
 * `tests/performance.test.ts` recorded 10.1.1 and 10.1.4 as **not measured here**, because both are
 * about what a browser does and there was no browser-side anything to measure. E10 delivered the
 * screens and they are now served, so the block is gone and these are the measurements.
 *
 * **What is measured, stated precisely, because the honest scope is narrower than the requirement.**
 * jsdom builds a DOM and runs React; it performs no layout and paints no pixels. So what is bounded
 * here is *mount and reconciliation* — the part that grows with the number of clusters and the part
 * a careless render turns quadratic — plus the transfer time of the bundle at the stated bandwidth,
 * computed from the real byte sizes. What is **not** measured is layout, paint and compositing on
 * a real device. §5 of the test plan records that as needing a human with a phone, and no number
 * here should be read as closing it.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiClient, Fetcher } from '../client/src/lib/ApiClient';
import { ScreenProps } from '../client/src/screens/ScreenProps';
import { ResidentMapScreen } from '../client/src/screens/resident/ResidentMapScreen';
import { OperationsDashboardScreen } from '../client/src/screens/operations/OperationsDashboardScreen';
import { Role } from '../src/entity/enums';

afterEach(() => cleanup());

/** 10.1.1's stated connection: 10 Mbit/s, so 1.25 MB of payload per second. */
const BYTES_PER_SECOND = (10 * 1_000_000) / 8;

function props(body: unknown, principalRole = Role.Resident): ScreenProps {
  const fetcher: Fetcher = async () => ({ ok: true, status: 200, json: async () => body }) as Response;
  return {
    api: new ApiClient('', fetcher),
    params: {},
    principal: { accountId: 'perf-1', role: principalRole },
    onNavigate: vi.fn(),
    onPrincipalChange: vi.fn(),
  };
}

/** 300 clusters, the number 10.1.4 names. Ring vertices match the live feed's 36-point boundaries. */
function layers(count: number): unknown {
  const clusters = [];
  for (let i = 0; i < count; i += 1) {
    const ring: Array<[number, number]> = [];
    for (let v = 0; v < 36; v += 1) {
      const angle = (v / 36) * 2 * Math.PI;
      ring.push([1.24 + 0.0018 * Math.sin(angle) + (i % 40) * 0.003, 103.62 + 0.0018 * Math.cos(angle)]);
    }
    clusters.push({
      clusterId: `perf-${i}`,
      locality: `Synthetic locality ${i}`,
      tier: i % 3 === 0 ? 'High' : i % 3 === 1 ? 'Medium' : 'Low',
      tierLabel: i % 3 === 0 ? 'High priority' : i % 3 === 1 ? 'Medium priority' : 'Low priority',
      caseSize: 1 + (i % 260),
      ring,
    });
  }
  return { clusters, reports: [], savedLocations: [] };
}

describe('10.1.4 — the map with 300 clusters', () => {
  it('P7 — 300 clusters mount and become readable well inside the three-second budget', async () => {
    const started = performance.now();
    render(<ResidentMapScreen {...props(layers(300))} />);

    // The 300th, not the first: a screen that renders the head of a list quickly and then blocks
    // is exactly the failure 10.1.4 is about, and asserting on the first item would miss it.
    await waitFor(() => expect(screen.getByText('Synthetic locality 299')).toBeTruthy());
    const ms = performance.now() - started;

    console.log(`10.1.4 — 300 clusters mounted and readable: ${ms.toFixed(1)} ms (jsdom; no layout, no paint)`);
    // A third of the budget, because the two thirds this cannot see — layout, paint, compositing on
    // a mid-range phone — are the browser's, and leaving them the majority of the allowance is the
    // only defensible way to draw a conclusion from a headless number.
    expect(ms).toBeLessThan(1_000);
  });

  it('P8 — the tier arrives as a label on every row, so 300 rows cost no second pass (9.1.11)', async () => {
    render(<ResidentMapScreen {...props(layers(300))} />);
    await waitFor(() => expect(screen.getByText('Synthetic locality 299')).toBeTruthy());

    // Not a timing case, but a performance one: the label is in the payload, so nothing is derived
    // per row at render time. A screen that computed the label from the tier would be doing 300
    // lookups on every re-render, and the cost would appear only once the feed grew.
    expect(document.querySelectorAll('[data-part="tier"]').length).toBe(300);
  });
});

describe('10.1.1 — the operations dashboard, first complete view', () => {
  const OVERVIEW = {
    activeClusters: 29,
    totalActiveCases: 458,
    highTierClusters: 2,
    openVerifiedReports: 3,
    openWorkOrders: 4,
    overdueWorkOrders: 0,
    tierDistribution: { High: 2, Medium: 7, Low: 20 },
    dataAsOf: '2026-09-04T01:35:08.000Z',
    staleSources: [] as string[],
  };

  it('P9 — the dashboard mounts and shows real figures in a fraction of the budget', async () => {
    const started = performance.now();
    render(
      <OperationsDashboardScreen
        {...props({ overview: OVERVIEW, attention: [], rows: [] }, Role.OperationsManager)}
      />,
    );

    await waitFor(() => expect(screen.getByText('Open work orders')).toBeTruthy());
    const ms = performance.now() - started;

    console.log(`10.1.1 — dashboard mounted with figures: ${ms.toFixed(1)} ms (jsdom; excludes network and paint)`);
    expect(ms).toBeLessThan(1_000);
  });

  it('P10 — the served bundle transfers inside a fifth of the budget at 10 Mbit/s', () => {
    const dist = resolve(__dirname, '..', 'client', 'dist');
    let bytes = 0;
    const files = ['app.js', 'index.html', 'styles.css'];
    for (const file of files) {
      try {
        bytes += statSync(resolve(dist, file)).size;
      } catch {
        // No bundle in this checkout. Skipping silently would make this case pass on nothing, so
        // it fails loudly instead: the number is only meaningful against a real build.
        throw new Error(`client/dist/${file} is missing — run \`npm run build:client\` before measuring 10.1.1`);
      }
    }
    const seconds = bytes / BYTES_PER_SECOND;

    console.log(
      `10.1.1 — bundle ${(bytes / 1024).toFixed(0)} KB, ${seconds.toFixed(2)} s to transfer at 10 Mbit/s ` +
        `(uncompressed — the server sends it uncompressed too: no compression middleware is mounted, ` +
        `so this is the figure a real client transfers, not a pessimistic one)`,
    );
    // 600 ms of a 3 s budget. This is the one part of 10.1.1 that can be computed rather than
    // sampled, and it is also the part most likely to rot: a single charting library added without
    // thought would take the bundle past a megabyte and this case would say so.
    //
    // Worth knowing rather than acting on unasked: nothing compresses this response. `compression`
    // middleware would cut a 215 KB bundle to roughly a third, which is free headroom whenever it
    // is wanted — the budget is met without it, so it is recorded here rather than changed.
    expect(seconds).toBeLessThan(0.6);
  });
});
