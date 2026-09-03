/**
 * D-Fence — Lab 4 §3.2: source health, the three-interval rule and the staleness marker (US-1.5).
 *
 * §1.4 is four short requirements and the old implementation got two of them wrong in the same
 * direction — towards *looking* fine:
 *
 *  - it warned after **one** failed run, where 1.4.3 says three consecutive scheduled intervals;
 *  - it reported **two** sources, where 1.4.1 says every external data source.
 *
 * Neither defect was visible from the dashboard's own tests, because those asserted what the code
 * did. So the cases below are written against the requirement text first, and the boundary is
 * tested from both sides at two and three — the number is the whole requirement.
 */
import { describe, expect, it } from 'vitest';
import {
  CONSECUTIVE_FAILURES_FOR_WARNING,
  SelfReportingSource,
  SourceHealthController,
} from '../src/control/SourceHealthController';
import { InMemoryIngestionRunStore } from '../src/persistence/memory/InMemoryStores';
import { SourceKind } from '../src/entity/enums';

const INTERVALS = new Map<SourceKind, number>([
  [SourceKind.Clusters, 3_600],
  [SourceKind.Rainfall, 300],
  [SourceKind.Forecast, 21_600],
  [SourceKind.Geocoding, 172_800],
]);

/** Records a settled run and back-dates its end, so elapsed-interval rules can be exercised. */
async function record(
  runs: InMemoryIngestionRunStore,
  source: SourceKind,
  outcome: 'SUCCESS' | 'UNCHANGED' | 'FAILED',
  endedAt?: Date,
): Promise<void> {
  const run = await runs.recordStart(source, 'SCHEDULED');
  await runs.recordOutcome(run, outcome, outcome === 'FAILED' ? 0 : 15);
  if (endedAt !== undefined) {
    run.endedAt = endedAt;
  }
}

function geocoder(healthy: boolean, lastSuccess: Date | null): SelfReportingSource {
  return {
    health: () => ({
      source: SourceKind.Geocoding,
      healthy,
      detail: healthy ? null : 'HTTP 401 from OneMap: token expired',
      since: healthy ? null : new Date('2026-09-06T00:00:00Z'),
    }),
    lastSuccessAt: () => lastSuccess,
  };
}

describe('1.4.1 — every external data source is reported', () => {
  it('H1 — all four sources appear, including the two that were silently missing', async () => {
    const health = new SourceHealthController(new InMemoryIngestionRunStore(), INTERVALS);
    const sources = (await health.report()).map((r) => r.source);
    // The forecast and the geocoder were absent from the old panel. A source missing from a health
    // panel does not look unhealthy — it looks fine, which is the worse of the two errors.
    expect(sources.sort()).toEqual(
      [SourceKind.Clusters, SourceKind.Forecast, SourceKind.Geocoding, SourceKind.Rainfall].sort(),
    );
  });

  it('H2 — a source that has never run is reported as such, not as failing and not as healthy', async () => {
    const health = new SourceHealthController(new InMemoryIngestionRunStore(), INTERVALS);
    const clusters = (await health.report()).find((r) => r.source === SourceKind.Clusters);
    expect(clusters?.lastSuccessAt).toBeNull();
    // Not a warning: on a fresh deployment the first cycle has simply not happened yet.
    expect(clusters?.isWarning).toBe(false);
    // But certainly stale: there is no data behind it at all (1.4.4).
    expect(clusters?.isStale).toBe(true);
    expect(clusters?.reason).toBe('has not run yet');
  });

  it('H3 — 1.4.1: the last successful retrieval timestamp is the last SUCCESS, not the last run', async () => {
    const runs = new InMemoryIngestionRunStore();
    const at = new Date('2026-09-03T10:00:00Z');
    await record(runs, SourceKind.Clusters, 'SUCCESS', at);
    await record(runs, SourceKind.Clusters, 'FAILED');
    const row = (await new SourceHealthController(runs, INTERVALS).report()).find(
      (r) => r.source === SourceKind.Clusters,
    );
    expect(row?.lastSuccessAt?.toISOString()).toBe(at.toISOString());
  });

  it('H4 — 1.1.21: UNCHANGED counts as a success, because a quiet publisher is a live source', async () => {
    const runs = new InMemoryIngestionRunStore();
    await record(runs, SourceKind.Clusters, 'UNCHANGED');
    const row = (await new SourceHealthController(runs, INTERVALS).report()).find(
      (r) => r.source === SourceKind.Clusters,
    );
    expect(row?.lastSuccessAt).not.toBeNull();
    expect(row?.isWarning).toBe(false);
  });
});

describe('1.4.3 — three consecutive failed intervals, and not fewer', () => {
  it('W1 — the boundary: two failures do not warn, three do', async () => {
    expect(CONSECUTIVE_FAILURES_FOR_WARNING).toBe(3);
    const runs = new InMemoryIngestionRunStore();
    const health = new SourceHealthController(runs, INTERVALS);
    const now = new Date('2026-09-03T12:00:00Z');
    // A success five minutes ago, so the elapsed-interval condition cannot fire and this case is
    // testing the failure count alone.
    await record(runs, SourceKind.Clusters, 'SUCCESS', new Date(now.getTime() - 5 * 60_000));

    const warning = async (): Promise<boolean | undefined> =>
      (await health.report(now)).find((r) => r.source === SourceKind.Clusters)?.isWarning;

    await record(runs, SourceKind.Clusters, 'FAILED');
    expect(await warning()).toBe(false);
    await record(runs, SourceKind.Clusters, 'FAILED');
    expect(await warning()).toBe(false);
    await record(runs, SourceKind.Clusters, 'FAILED');
    expect(await warning()).toBe(true);
  });

  it('W2 — the run must be UNBROKEN: a success between failures resets the count', async () => {
    const runs = new InMemoryIngestionRunStore();
    const now = new Date('2026-09-03T12:00:00Z');
    await record(runs, SourceKind.Clusters, 'FAILED');
    await record(runs, SourceKind.Clusters, 'FAILED');
    await record(runs, SourceKind.Clusters, 'SUCCESS', new Date(now.getTime() - 60_000));
    await record(runs, SourceKind.Clusters, 'FAILED');

    const row = (await new SourceHealthController(runs, INTERVALS).report(now)).find(
      (r) => r.source === SourceKind.Clusters,
    );
    // 1.4.3 says consecutive. Three failures with a success in the middle is a flapping source,
    // not a down one, and the panel would be useless if it could not tell them apart.
    expect(row?.consecutiveFailures).toBe(1);
    expect(row?.isWarning).toBe(false);
  });

  it('W3 — the outage a failure counter cannot see: nothing ran at all', async () => {
    const runs = new InMemoryIngestionRunStore();
    const now = new Date('2026-09-03T12:00:00Z');
    // One success, four hours ago, and then silence. The scheduler has stopped: there are no
    // FAILED rows to count, and an implementation that only counts failures reports this as fine.
    await record(runs, SourceKind.Clusters, 'SUCCESS', new Date(now.getTime() - 4 * 3_600_000));

    const row = (await new SourceHealthController(runs, INTERVALS).report(now)).find(
      (r) => r.source === SourceKind.Clusters,
    );
    expect(row?.consecutiveFailures).toBe(0);
    expect(row?.isWarning).toBe(true);
    expect(row?.reason).toContain('4 scheduled intervals');
  });

  it('W4 — the elapsed-interval boundary is per source, from configuration (10.6.2)', async () => {
    const runs = new InMemoryIngestionRunStore();
    const now = new Date('2026-09-03T12:00:00Z');
    // Twenty minutes of silence. For rainfall (300 s) that is four missed intervals and a warning;
    // for clusters (3,600 s) it is not yet one. Same elapsed time, different verdicts, which is
    // the point of reading the interval rather than hard-coding a duration.
    const twentyMinutesAgo = new Date(now.getTime() - 20 * 60_000);
    await record(runs, SourceKind.Rainfall, 'SUCCESS', twentyMinutesAgo);
    await record(runs, SourceKind.Clusters, 'SUCCESS', twentyMinutesAgo);

    const rows = await new SourceHealthController(runs, INTERVALS).report(now);
    expect(rows.find((r) => r.source === SourceKind.Rainfall)?.isWarning).toBe(true);
    expect(rows.find((r) => r.source === SourceKind.Clusters)?.isWarning).toBe(false);
  });

  it('W5 — a source that has run and never once succeeded is a warning immediately', async () => {
    const runs = new InMemoryIngestionRunStore();
    await record(runs, SourceKind.Forecast, 'FAILED');
    const row = (await new SourceHealthController(runs, INTERVALS).report()).find(
      (r) => r.source === SourceKind.Forecast,
    );
    // Different from "has not run yet": something tried, and there has never been any data.
    expect(row?.isWarning).toBe(true);
    expect(row?.reason).toBe('has never completed a successful retrieval');
  });
});

describe('1.4.4 — the staleness marker is a lower bar than the warning', () => {
  it('S1 — one missed interval marks the data stale without raising an alarm', async () => {
    const runs = new InMemoryIngestionRunStore();
    const now = new Date('2026-09-03T12:00:00Z');
    // Ninety minutes: past the cluster interval of one hour, well short of three.
    await record(runs, SourceKind.Clusters, 'SUCCESS', new Date(now.getTime() - 90 * 60_000));
    const row = (await new SourceHealthController(runs, INTERVALS).report(now)).find(
      (r) => r.source === SourceKind.Clusters,
    );
    expect(row?.isStale).toBe(true);
    expect(row?.isWarning).toBe(false);
  });

  it('S2 — data inside its own interval is neither stale nor warned on', async () => {
    const runs = new InMemoryIngestionRunStore();
    const now = new Date('2026-09-03T12:00:00Z');
    await record(runs, SourceKind.Clusters, 'SUCCESS', new Date(now.getTime() - 10 * 60_000));
    const row = (await new SourceHealthController(runs, INTERVALS).report(now)).find(
      (r) => r.source === SourceKind.Clusters,
    );
    expect(row?.isStale).toBe(false);
    expect(row?.isWarning).toBe(false);
  });

  it('S3 — isStale answers per source, and defaults to stale for a source it cannot find', async () => {
    const runs = new InMemoryIngestionRunStore();
    const now = new Date('2026-09-03T12:00:00Z');
    await record(runs, SourceKind.Rainfall, 'SUCCESS', new Date(now.getTime() - 60_000));
    const health = new SourceHealthController(runs, INTERVALS);
    expect(await health.isStale(SourceKind.Rainfall, now)).toBe(false);
    expect(await health.isStale(SourceKind.Clusters, now)).toBe(true);
  });
});

describe('3.1.16 — the geocoder, which has no ingestion job', () => {
  it('G1 — an unconfigured geocoder is reported as unconfigured, never as healthy', async () => {
    const row = (await new SourceHealthController(new InMemoryIngestionRunStore(), INTERVALS).report()).find(
      (r) => r.source === SourceKind.Geocoding,
    );
    expect(row?.reason).toBe('not configured');
    expect(row?.isStale).toBe(true);
  });

  it('G2 — an authentication failure warns at once, because a lapsed token does not clear itself', async () => {
    const now = new Date('2026-09-07T00:00:00Z');
    const health = new SourceHealthController(
      new InMemoryIngestionRunStore(),
      INTERVALS,
      geocoder(false, new Date(now.getTime() - 60_000)),
    );
    const row = (await health.report(now)).find((r) => r.source === SourceKind.Geocoding);
    // Unlike a 503, this one is a date on a calendar: the OneMap token in src/.env expires
    // 2026-09-06 and no amount of waiting will fix it.
    expect(row?.isWarning).toBe(true);
    expect(row?.reason).toContain('token expired');
  });

  it('G3 — a healthy geocoder used within its refresh interval is clean', async () => {
    const now = new Date('2026-09-03T12:00:00Z');
    const health = new SourceHealthController(
      new InMemoryIngestionRunStore(),
      INTERVALS,
      geocoder(true, new Date(now.getTime() - 3_600_000)),
    );
    const row = (await health.report(now)).find((r) => r.source === SourceKind.Geocoding);
    expect(row?.isWarning).toBe(false);
    expect(row?.isStale).toBe(false);
  });

  it('G4 — a healthy geocoder silent for three refresh intervals still warns (3.1.15)', async () => {
    const now = new Date('2026-09-10T12:00:00Z');
    const health = new SourceHealthController(
      new InMemoryIngestionRunStore(),
      INTERVALS,
      geocoder(true, new Date(now.getTime() - 7 * 86_400_000)),
    );
    const row = (await health.report(now)).find((r) => r.source === SourceKind.Geocoding);
    // Seven days without a single successful call, on a 48-hour token: the token has lapsed
    // whether or not anything has yet noticed, which is what 3.1.15 is guarding against.
    expect(row?.isWarning).toBe(true);
  });
});

describe('The entity view — 1.4.2', () => {
  it('E1 — the rows map onto SourceHealth for anything that stores or serialises them', async () => {
    const runs = new InMemoryIngestionRunStore();
    await record(runs, SourceKind.Clusters, 'SUCCESS');
    const entities = await new SourceHealthController(runs, INTERVALS).asEntities();
    expect(entities).toHaveLength(4);
    expect(entities.every((e) => typeof e.isWarning === 'boolean')).toBe(true);
    expect(entities.find((e) => e.source === SourceKind.Clusters)?.lastSuccessAt).not.toBeNull();
  });
});
