/**
 * D-Fence — Lab 4 §3.2: the ingestion template and a full scoring cycle, with no network and no
 * database. Both run against fakes, which is the claim the ports layer exists to make true (10.6.3).
 *
 * The cases here cover the behaviour that only shows up when the pieces run together: the 1.1.20
 * conditional download across two cycles, the 10.2.2/10.2.4 failure path, and a scoring cycle that
 * has to rank, degrade and explain itself.
 */
import { describe, expect, it } from 'vitest';
import { ClusterIngestionJob } from '../src/control/ingestion/ClusterIngestionJob';
import { RunOutcome } from '../src/control/ingestion/AbstractIngestionJob';
import { PriorityScoringEngine } from '../src/control/PriorityScoringEngine';
import { NormalisationFactory } from '../src/control/normalisation/NormalisationFactory';
import { ConfigSet } from '../src/config/ConfigSet';
import { ConfigLoader } from '../src/config/ConfigLoader';
import {
  InMemoryClusterStore,
  InMemoryIngestionRunStore,
  InMemoryPriorityScoreStore,
} from '../src/persistence/memory/InMemoryStores';
import { Driver, PriorityTier, SourceKind, ChangeClass } from '../src/entity/enums';
import { RawPayload } from '../src/ports/types';
import { ClusterSource } from '../src/ports/ExternalGateway';

/** Two features from the real payload, trimmed to what 1.1.3 requires plus the habitat text. */
function payload(caseSize = 258): unknown {
  return {
    type: 'FeatureCollection',
    features: [
      {
        geometry: { type: 'Polygon', coordinates: [[[103.81, 1.38], [103.82, 1.38], [103.82, 1.39], [103.81, 1.38]]] },
        properties: {
          OBJECTID: 525120,
          LOCALITY: 'Countryside Rd, Walk / Florissa Pk',
          CASE_SIZE: caseSize,
          HOMES: 'Domestic container, Bin',
          PUBLIC_PLACES: 'Ceramic pot, Discarded plastic cup',
          CONSTRUCTION_SITES: null,
          INC_CRC: 'A80EE9CCBD4A394B',
          FMEL_UPD_D: '20260828155154',
        },
      },
      {
        geometry: { type: 'Polygon', coordinates: [[[103.90, 1.40], [103.91, 1.40], [103.91, 1.41], [103.90, 1.40]]] },
        properties: {
          OBJECTID: 525131,
          LOCALITY: 'Punggol Dr (Blk 612A)',
          CASE_SIZE: 2,
          HOMES: null,
          PUBLIC_PLACES: null,
          CONSTRUCTION_SITES: null,
          INC_CRC: 'B11CE9CCBD4A0001',
          FMEL_UPD_D: '20260825155459',
        },
      },
      {
        // 1.1.3: no LOCALITY. Must be rejected by name and must not stop the other two (1.1.17).
        geometry: { type: 'Polygon', coordinates: [[[103.7, 1.3]]] },
        properties: { OBJECTID: 999999, CASE_SIZE: 7 },
      },
    ],
  };
}

/** A fake NEA feed. `stamp` is what the metadata resource would report. */
class FakeFeed implements ClusterSource {
  constructor(
    public stamp: string | null = '2026-09-03T10:06:44+08:00',
    private readonly body: unknown = payload(),
    private readonly failFetch = false,
  ) {}

  downloads = 0;
  metadataCalls = 0;

  sourceKind(): SourceKind {
    return SourceKind.Clusters;
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async fetchLastUpdatedAt(): Promise<string | null> {
    this.metadataCalls += 1;
    return this.stamp;
  }

  async fetchClusters(): Promise<RawPayload> {
    this.downloads += 1;
    if (this.failFetch) {
      throw new Error('upstream 503');
    }
    return { retrievedAt: new Date('2026-09-03T12:00:00+08:00'), body: this.body };
  }
}

describe('Ingestion template — the 1.1.20 conditional download across cycles', () => {
  it('I1 — the first cycle downloads and stores, and rejects the incomplete feature by name', async () => {
    const feed = new FakeFeed();
    const runs = new InMemoryIngestionRunStore();
    const clusters = new InMemoryClusterStore();
    const job = new ClusterIngestionJob(feed, runs, clusters);

    const run = await job.run();

    expect(run.outcome).toBe(RunOutcome.Success);
    expect(run.featureCount).toBe(2);
    expect(feed.downloads).toBe(1);
    expect(job.rejected).toEqual([{ objectId: '999999', missingField: 'LOCALITY' }]);
    expect((await clusters.findActive()).length).toBe(2);
  });

  it('I2 — a second cycle with an unmoved stamp records UNCHANGED and does not download (1.1.20, 1.1.21)', async () => {
    const feed = new FakeFeed();
    const runs = new InMemoryIngestionRunStore();
    const clusters = new InMemoryClusterStore();
    const job = new ClusterIngestionJob(feed, runs, clusters);

    await job.run();
    const second = await job.run();

    expect(second.outcome).toBe(RunOutcome.Unchanged);
    expect(feed.downloads).toBe(1);
    expect(feed.metadataCalls).toBe(2);
    // The data is still there — an UNCHANGED run is not an empty one.
    expect((await clusters.findActive()).length).toBe(2);
  });

  it('I3 — a moved stamp downloads again and records the case delta (1.1.8, 1.1.9)', async () => {
    const feed = new FakeFeed();
    const runs = new InMemoryIngestionRunStore();
    const clusters = new InMemoryClusterStore();
    const job = new ClusterIngestionJob(feed, runs, clusters);

    await job.run();
    const grown = new FakeFeed('2026-09-04T10:06:44+08:00', payload(300));
    const job2 = new ClusterIngestionJob(grown, runs, clusters);
    await job2.run();

    const active = await clusters.findActive();
    const countryside = active.find((c) => c.objectId === '525120');
    expect(countryside?.caseSize).toBe(300);
    expect(countryside?.caseDelta).toBe(42);
    expect(countryside?.changeClass).toBe(ChangeClass.GROWN);
  });

  it('I4 — a failed fetch marks the source stale and keeps the stored data (10.2.2, 10.2.4)', async () => {
    const runs = new InMemoryIngestionRunStore();
    const clusters = new InMemoryClusterStore();
    await new ClusterIngestionJob(new FakeFeed(), runs, clusters).run();

    const broken = new FakeFeed('2026-09-05T10:06:44+08:00', payload(), true);
    const run = await new ClusterIngestionJob(broken, runs, clusters).run();

    expect(run.outcome).toBe(RunOutcome.Failed);
    expect(runs.isStale(SourceKind.Clusters)).toBe(true);
    // 10.2.4: the previous cycle's data survives a failed one.
    expect((await clusters.findActive()).length).toBe(2);
  });

  it('I5 — the publisher stamp is recorded only after a successful store, so a failure retries', async () => {
    const runs = new InMemoryIngestionRunStore();
    const clusters = new InMemoryClusterStore();
    const broken = new FakeFeed('2026-09-03T10:06:44+08:00', payload(), true);

    await new ClusterIngestionJob(broken, runs, clusters).run();
    expect(await runs.lastPublisherStamp(SourceKind.Clusters)).toBeNull();

    const working = new FakeFeed('2026-09-03T10:06:44+08:00');
    await new ClusterIngestionJob(working, runs, clusters).run();
    expect(working.downloads).toBe(1);
  });
});

describe('A full scoring cycle over ingested clusters', () => {
  async function cycle(): Promise<{
    engine: PriorityScoringEngine;
    clusters: InMemoryClusterStore;
    scores: InMemoryPriorityScoreStore;
    config: ConfigSet;
  }> {
    const runs = new InMemoryIngestionRunStore();
    const clusters = new InMemoryClusterStore();
    await new ClusterIngestionJob(new FakeFeed(), runs, clusters).run();

    const config = new ConfigSet();
    ConfigLoader.applyScoring(config, {
      driverWeights: {
        CaseSize: 0.3,
        CaseGrowthDelta: 0.2,
        DaysSinceLastTreatment: 0.15,
        Rainfall72h: 0.12,
        Rainfall24h: 0.08,
        VerifiedOpenReportCount: 0.1,
        PremisesMix: 0.05,
      },
      tierThresholds: { high: 70, medium: 40 },
    });
    config.validateComplete();

    const scores = new InMemoryPriorityScoreStore();
    const engine = new PriorityScoringEngine(NormalisationFactory.build(), config, scores);
    return { engine, clusters, scores, config };
  }

  it('S1 — the 258-case cluster outranks the 2-case cluster, and rank starts at 1 (4.1.14)', async () => {
    const { engine, clusters } = await cycle();
    const active = await clusters.findActive();
    const inputs = new Map(active.map((c) => [c.id, { rainfall24h: 10, rainfall72h: 20, verifiedOpenReports: 0, daysSinceLastTreatment: 90 }]));

    const ranking = await engine.computeScores(active, inputs);
    const top = ranking.top(2);

    expect(top[0]?.rank).toBe(1);
    expect(top[0]?.score).toBeGreaterThan(top[1]?.score as number);
  });

  it('S2 — every driver present means the score is not degraded (4.1.13)', async () => {
    const { engine, clusters } = await cycle();
    const active = await clusters.findActive();
    const inputs = new Map(active.map((c) => [c.id, { rainfall24h: 10, rainfall72h: 20, verifiedOpenReports: 1, daysSinceLastTreatment: 5 }]));

    const ranking = await engine.computeScores(active, inputs);

    expect(ranking.top(1)[0]?.isDegraded).toBe(false);
    expect(ranking.top(1)[0]?.breakdown()).toHaveLength(7);
  });

  it('S3 — a stale rainfall feed degrades the score and names the drivers, never scoring them as 0 (4.1.12, 4.1.19, 4.1.20)', async () => {
    const { engine, clusters } = await cycle();
    const active = await clusters.findActive();
    const inputs = new Map(active.map((c) => [c.id, { verifiedOpenReports: 1, daysSinceLastTreatment: 5 }]));
    engine.markStale([Driver.Rainfall24h, Driver.Rainfall72h]);

    const score = (await engine.computeScores(active, inputs)).top(1)[0];

    expect(score?.isDegraded).toBe(true);
    expect(score?.excludedDrivers).toEqual([Driver.Rainfall24h, Driver.Rainfall72h]);
    expect(score?.breakdown()).toHaveLength(5);
    // 4.1.19: the remaining weights are renormalised, so removing a driver must not simply
    // subtract its share and push every cluster down the table.
    expect(score?.score).toBeGreaterThan(0);
  });

  it('S4 — a treatment lowers the score, all else equal (4.1.17)', async () => {
    const { engine, clusters } = await cycle();
    const active = await clusters.findActive();
    const base = { rainfall24h: 10, rainfall72h: 20, verifiedOpenReports: 0 };

    const untreated = await engine.computeScores(active, new Map(active.map((c) => [c.id, { ...base, daysSinceLastTreatment: 90 }])));
    const treated = await engine.computeScores(active, new Map(active.map((c) => [c.id, { ...base, daysSinceLastTreatment: 0 }])));

    expect(treated.top(1)[0]?.score).toBeLessThan(untreated.top(1)[0]?.score as number);
  });

  it('S5 — every cycle is kept as history (4.1.11) and the top score explains itself (4.1.18)', async () => {
    const { engine, clusters, scores } = await cycle();
    const active = await clusters.findActive();
    const inputs = new Map(active.map((c) => [c.id, { rainfall24h: 5, rainfall72h: 5, verifiedOpenReports: 0, daysSinceLastTreatment: 30 }]));

    await engine.computeScores(active, inputs);
    await engine.computeScores(active, inputs);

    const history = await scores.historyFor(active[0]?.id as string, 10);
    expect(history.length).toBe(2);
    expect((await scores.latest()).length).toBe(active.length);

    const top = (await engine.computeScores(active, inputs)).top(1)[0];
    expect(top?.explain()).toMatch(/^Score \d+\.\d \((High|Medium|Low)\), led by /);
  });

  it('S6 — a cluster with no habitat text still scores, with premises mix at 0 (1.1.16)', async () => {
    const { engine, clusters } = await cycle();
    const active = await clusters.findActive();
    const punggol = active.find((c) => c.objectId === '525131');
    expect(punggol?.premisesMix.ratio()).toBe(0);

    const score = engine.scoreOne(punggol!, { rainfall24h: 0, rainfall72h: 0, verifiedOpenReports: 0, daysSinceLastTreatment: 0 });
    expect(score.isDegraded).toBe(false);
    expect(score.tier).toBe(PriorityTier.Low);
  });
});

describe('Configuration loading', () => {
  it('C1 — .env parsing keeps a JWT intact and ignores comments and blanks (10.3.4)', () => {
    const env = ConfigLoader.parseEnv(
      '# comment\n\nONE_MAP_TOKEN="eyJhbGciOi.J1c2VyX2lk.LrJVNmKc-eNvSh"\nEMPTY=\n',
    );
    expect(env.get('ONE_MAP_TOKEN')).toBe('eyJhbGciOi.J1c2VyX2lk.LrJVNmKc-eNvSh');
    expect(env.get('EMPTY')).toBe('');
    expect(env.size).toBe(2);
  });

  it('C2 — the shipped default configuration is valid and complete (4.1.3, 4.1.6)', () => {
    const config = ConfigLoader.load();
    expect(() => {
      config.validateComplete();
    }).not.toThrow();
    expect(config.driverWeights.size).toBe(7);
    expect(config.tierThresholds.high).toBe(70);
    expect(config.clusterSource.datasetId).toBe('d_dbfabf16158d1b0e1c420627c0819168');
  });

  it('C3 — a configuration missing a driver is rejected at startup, not at scoring time', () => {
    const config = new ConfigSet();
    ConfigLoader.applyScoring(config, { driverWeights: { CaseSize: 1.0 } });
    expect(() => {
      config.validateComplete();
    }).toThrow(/no weight configured for/);
  });

  it('C4 — an unknown driver name in configuration is rejected by name (4.1.3)', () => {
    expect(() => {
      ConfigLoader.applyScoring(new ConfigSet(), { driverWeights: { Humidity: 1.0 } });
    }).toThrow(/unknown driver 'Humidity'/);
  });
});
