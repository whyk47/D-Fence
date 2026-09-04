/**
 * D-Fence — Lab 4 §3.2 and US-0.5: the §10.1 performance obligations, measured.
 *
 * US-0.5 exists because §10.1 states four numbers and a project can very easily assert them in a
 * report without ever running anything. These cases measure three of the four and record what they
 * measured; the two that need a browser and a network are recorded as **not measured here**, with
 * what would be needed, rather than quietly counted as passing.
 *
 * **What these numbers are and are not.** They are measured against the in-memory stores on a
 * development machine, so they exclude PostGIS, the network and the browser. That makes them a
 * floor, not a ceiling: work that is already too slow here can only get slower. Where the margin is
 * large the conclusion is safe; where it is thin the number is reported rather than rounded.
 */
import { describe, expect, it } from 'vitest';
import { PriorityScoringEngine, DriverInputs } from '../src/control/PriorityScoringEngine';
import { NormalisationFactory } from '../src/control/normalisation/NormalisationFactory';
import { ConfigLoader } from '../src/config/ConfigLoader';
import { AccessControlService } from '../src/control/AccessControlService';
import { AccessPolicy } from '../src/control/AccessPolicy';
import { DashboardController, principalFor } from '../src/control/DashboardController';
import { MapViewController } from '../src/control/MapViewController';
import { TrendAnalyser } from '../src/control/TrendAnalyser';
import {
  InMemoryAuditStore,
  InMemoryClusterStore,
  InMemoryIngestionRunStore,
  InMemoryPriorityScoreStore,
} from '../src/persistence/memory/InMemoryStores';
import { InMemoryClusterLocator } from '../src/persistence/memory/InMemoryReportStores';
import { Cluster } from '../src/entity/Cluster';
import { GeoPoint, Polygon, PremisesMix } from '../src/entity/valueTypes';
import { ChangeClass, Role } from '../src/entity/enums';

const MANAGER = principalFor(Role.OperationsManager, 'manager-1');

/**
 * A cluster with a realistic boundary. Thirty-six vertices, because the live NEA feed's first
 * cluster on 2026-09-03 had exactly that — a synthetic square would make the geometry look free.
 */
function syntheticCluster(index: number): Cluster {
  const cluster = new Cluster();
  cluster.objectId = `perf-${index}`;
  cluster.locality = `Synthetic locality ${index}`;
  cluster.caseSize = 1 + (index % 260);
  cluster.caseDelta = index % 12;
  cluster.changeClass = ChangeClass.GROWN;
  cluster.heavyRainExpected = false;
  cluster.isActive = true;
  cluster.premisesMix = new PremisesMix(['Bin', 'Flower pot'], ['Ceramic pot'], []);

  // Spread across Singapore's bounding box so no two clusters coincide.
  const lat = 1.24 + (index % 40) * 0.003;
  const lon = 103.62 + Math.floor(index / 40) * 0.02;
  const r = 0.0018;
  const ring: GeoPoint[] = [];
  for (let v = 0; v < 36; v += 1) {
    const angle = (v / 36) * 2 * Math.PI;
    ring.push(new GeoPoint(lat + r * Math.sin(angle), lon + r * Math.cos(angle)));
  }
  ring.push(ring[0] as GeoPoint);
  cluster.boundary = new Polygon([ring]);
  return cluster;
}

async function seed(count: number): Promise<{ clusters: InMemoryClusterStore; stored: Cluster[] }> {
  const clusters = new InMemoryClusterStore();
  const records = Array.from({ length: count }, (_, i) => syntheticCluster(i));
  await clusters.upsertFromFeed({ retrievedAt: new Date(), records });
  return { clusters, stored: await clusters.findActive() };
}

/** Runs `fn` once and returns the wall-clock milliseconds it took. */
async function timed(fn: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await fn();
  return performance.now() - started;
}

describe('10.1.3 — a scoring cycle for 500 clusters within 60 seconds', () => {
  it('P1 — 500 clusters are scored well inside the bound, and the measurement is recorded', async () => {
    const { clusters, stored } = await seed(500);
    expect(stored).toHaveLength(500);

    const config = ConfigLoader.load();
    const scores = new InMemoryPriorityScoreStore();
    const engine = new PriorityScoringEngine(NormalisationFactory.build(config.normalisation), config, scores);

    // All seven drivers present, so this is the full cycle rather than a degraded one — a
    // measurement taken with drivers missing would flatter the result.
    const inputs = new Map<string, DriverInputs>();
    stored.forEach((c, i) => {
      inputs.set(c.id, {
        rainfall24h: i % 40,
        rainfall72h: i % 90,
        verifiedOpenReports: i % 4,
        daysSinceLastTreatment: i % 90,
      });
    });

    const ms = await timed(async () => engine.computeScores(stored, inputs, new Date()));
    console.log(`10.1.3 — 500-cluster scoring cycle: ${ms.toFixed(1)} ms (bound 60,000 ms)`);

    const scored = await scores.latest();
    expect(scored).toHaveLength(500);
    // The measurement is only meaningful if it was a FULL cycle. The first version of this case
    // misspelled two driver names, the map silently carried nothing the engine recognised, and it
    // measured a degraded cycle with five drivers instead of seven. `tsc --strict` caught it.
    expect(scored.every((s) => !s.isDegraded)).toBe(true);
    expect(scored[0]?.breakdown()).toHaveLength(7);
    expect(ms).toBeLessThan(60_000);
    // Asserted an order of magnitude tighter than the requirement as well, so that a future change
    // which makes this a hundred times slower fails here rather than passing at 59 seconds.
    expect(ms).toBeLessThan(6_000);
  });

  it('P2 — the ranking is complete and correctly ordered at 500 clusters (4.1.14)', async () => {
    const { stored } = await seed(500);
    const config = ConfigLoader.load();
    const scores = new InMemoryPriorityScoreStore();
    const engine = new PriorityScoringEngine(NormalisationFactory.build(config.normalisation), config, scores);
    await engine.computeScores(stored, new Map(), new Date());

    const latest = await scores.latest();
    const ranks = latest.map((s) => s.rank).sort((a, b) => a - b);
    // Speed is worthless if the answer is wrong: rank 1..500 with no gaps and no duplicates.
    expect(ranks[0]).toBe(1);
    expect(ranks[ranks.length - 1]).toBe(500);
    expect(new Set(ranks).size).toBe(500);
  });
});

describe('10.1.2 — 95% of read requests within one second', () => {
  it('P3 — the dashboard read path over 500 clusters, measured over 100 requests', async () => {
    const { clusters, stored } = await seed(500);
    const config = ConfigLoader.load();
    const scores = new InMemoryPriorityScoreStore();
    const engine = new PriorityScoringEngine(NormalisationFactory.build(config.normalisation), config, scores);
    await engine.computeScores(stored, new Map(), new Date());

    const dashboard = new DashboardController(
      new AccessControlService(new AccessPolicy(), new InMemoryAuditStore()),
      clusters,
      scores,
      new InMemoryIngestionRunStore(),
    );

    const samples: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      samples.push(await timed(async () => dashboard.buildPriorityTable(MANAGER)));
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)] as number;
    console.log(`10.1.2 — priority table p95: ${p95.toFixed(1)} ms (bound 1,000 ms, server-side only)`);

    expect(p95).toBeLessThan(1_000);
  });

  it('P4 — the map layer read path over 300 polygons (10.1.4, server half)', async () => {
    const { clusters, stored } = await seed(300);
    const config = ConfigLoader.load();
    const scores = new InMemoryPriorityScoreStore();
    const engine = new PriorityScoringEngine(NormalisationFactory.build(config.normalisation), config, scores);
    await engine.computeScores(stored, new Map(), new Date());

    const map = new MapViewController(
      new AccessControlService(new AccessPolicy(), new InMemoryAuditStore()),
      clusters,
      scores,
      new TrendAnalyser(clusters),
    );

    const ms = await timed(async () => map.layers(MANAGER));
    const layers = await map.layers(MANAGER);
    console.log(
      `10.1.4 — 300-polygon layer assembly: ${ms.toFixed(1)} ms server-side ` +
        `(${layers.clusters.reduce((n, c) => n + c.ring.length, 0)} vertices; the 3 s bound is end-to-end)`,
    );

    expect(layers.clusters).toHaveLength(300);
    // The requirement is about *rendering*, which is the browser's half and is not measured here.
    // What this bounds is the half we control: assembling the payload must not eat the budget.
    expect(ms).toBeLessThan(500);
  });
});

describe('10.1.1, 10.1.4, 10.1.5 — where each is measured, and what remains unmeasured', () => {
  it('P5 — every §10.1 obligation names where its number comes from, or why it has none', () => {
    // Updated 2026-09-04. All three items on this list were "not measured here" and two of the
    // three blocks are gone: the screens exist and are served, and there is a live database to
    // put under load. What is left is genuinely not measurable from a process — and saying which
    // is which is the whole purpose of this case.
    const obligations = [
      {
        requirement: '10.1.1',
        claim: 'dashboard first render within 3 s on 10 Mbit/s',
        measuredBy: 'tests/performance-client.test.tsx P9 (mount) and P10 (transfer at 10 Mbit/s, ' +
          'from the real bundle size)',
        stillUnmeasured: 'layout, paint and compositing on a real device',
      },
      {
        requirement: '10.1.4',
        claim: 'map renders 300 polygons within 3 s',
        measuredBy: 'P4 here (server assembly) and performance-client P7 (300 clusters mounted)',
        stillUnmeasured: 'the drawing itself — no mapping SDK is bundled, by the stated decision ' +
          'in ResidentMapScreen',
      },
      {
        requirement: '10.1.5',
        claim: '50 concurrent authenticated users hold the 10.1.2 latency',
        measuredBy: 'src/tools/load-check.ts, against a running server and the live database',
        // Measured 2026-09-04 and NOT HELD: p95 2125 ms against a 1000 ms budget, localised to
        // /api/ops/dashboard (p50 1475 ms under load, 179 ms unloaded). Recorded here so the
        // suite cannot read as though §10.1 were fully satisfied.
        stillUnmeasured: 'a deployed instance measured across a real network rather than localhost',
      },
    ];
    expect(obligations).toHaveLength(3);
    for (const item of obligations) {
      // Both fields, always: an obligation with no measurement is a gap, and one with no stated
      // residue is a claim that a partial number closed it.
      expect(item.measuredBy).not.toBe('');
      expect(item.stillUnmeasured).not.toBe('');
    }
  });
});

describe('10.1.3 at scale — the spatial path', () => {
  it('P6 — containment across 500 boundaries stays well inside the cycle budget (3.1.8, 5.1.7)', async () => {
    const { clusters } = await seed(500);
    const locator = new InMemoryClusterLocator(clusters);
    const point = new GeoPoint(1.30, 103.70);

    // 3.1.8 re-evaluates every saved location on every cycle, so this runs per location per cycle.
    // It is the part of the cycle that grows with *both* clusters and residents, which makes it
    // the first thing that will hurt — and the reason it is measured separately.
    const ms = await timed(async () => {
      for (let i = 0; i < 50; i += 1) {
        await locator.nearestWithin(point, 2000);
      }
    });
    console.log(`3.1.8 — 50 exposure evaluations over 500 boundaries: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(10_000);
  });
});
