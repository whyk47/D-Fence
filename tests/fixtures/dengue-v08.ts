/**
 * D-Fence — the v0.8 dengue fixtures, frozen.
 *
 * Traces: 4.2.5. These five clusters and their driver inputs are the subject of the compatibility
 * obligation: the generalised scorer must produce, for the mosquito pest type, exactly the score the
 * v0.8 engine produced for the same inputs. The expected values in `tests/pest-compatibility.test.ts`
 * were generated from the v0.8 `PriorityScoringEngine` *before* the generalisation was written, by
 * `tests/fixtures/generate-v08-goldens.ts`, and are literals rather than a re-computation on purpose:
 * a golden that is recomputed by the code under test asserts nothing.
 *
 * `DriverInputs` is restated structurally here rather than imported, so that this file does not move
 * when the scorer is split — the fixtures must outlive the class that first consumed them.
 */
import { Cluster } from '../../src/entity/Cluster';
import { PremisesMix, Polygon } from '../../src/entity/valueTypes';
import { ChangeClass, ForecastRegion, Trajectory } from '../../src/entity/enums';

export interface FixtureInputs {
  rainfall24h?: number;
  rainfall72h?: number;
  verifiedOpenReports?: number;
  daysSinceLastTreatment?: number;
}

export interface DengueFixture {
  readonly name: string;
  readonly cluster: Cluster;
  readonly inputs: FixtureInputs;
}

function habitats(n: number, prefix: string): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
}

function cluster(
  id: string,
  locality: string,
  caseSize: number,
  caseDelta: number,
  mix: [number, number, number],
): Cluster {
  const c = new Cluster();
  c.id = id;
  c.objectId = id;
  c.locality = locality;
  c.boundary = new Polygon([]);
  c.caseSize = caseSize;
  c.caseDelta = caseDelta;
  c.premisesMix = new PremisesMix(
    habitats(mix[0], 'home'),
    habitats(mix[1], 'public'),
    habitats(mix[2], 'site'),
  );
  c.changeClass = ChangeClass.GROWN;
  c.forecastRegion = ForecastRegion.east;
  c.heavyRainExpected = false;
  c.trajectory = Trajectory.Growing;
  c.firstSeenAt = new Date('2026-08-01T00:00:00Z');
  c.lastUpdatedAt = new Date('2026-09-03T00:00:00Z');
  c.isActive = true;
  return c;
}

/** The scoring instant every golden was computed at. Fixed, because RecencyDecay reads `now`. */
export const FIXTURE_NOW = new Date('2026-09-03T00:00:00Z');

export const DENGUE_FIXTURES: DengueFixture[] = [
  {
    name: 'D1 large active cluster',
    cluster: cluster('d1', 'Bedok North Avenue 3', 258, 12, [40, 8, 2]),
    inputs: { rainfall24h: 18, rainfall72h: 44, verifiedOpenReports: 3, daysSinceLastTreatment: 21 },
  },
  {
    name: 'D2 small new cluster',
    cluster: cluster('d2', 'Alkaff Crescent', 3, 3, [2, 0, 0]),
    inputs: { rainfall24h: 0, rainfall72h: 2, verifiedOpenReports: 0, daysSinceLastTreatment: 90 },
  },
  {
    name: 'D3 mid cluster, saturating rainfall',
    cluster: cluster('d3', 'Yishun Ring Road', 47, 5, [12, 30, 4]),
    inputs: { rainfall24h: 120, rainfall72h: 300, verifiedOpenReports: 9, daysSinceLastTreatment: 0 },
  },
  {
    name: 'D4 zero everywhere',
    cluster: cluster('d4', 'Zzz Terrace', 0, 0, [0, 0, 0]),
    inputs: { rainfall24h: 0, rainfall72h: 0, verifiedOpenReports: 0, daysSinceLastTreatment: 0 },
  },
  {
    name: 'D5 partial inputs — two drivers absent, score degrades and renormalises',
    cluster: cluster('d5', 'Circuit Road', 31, 7, [9, 1, 1]),
    inputs: { verifiedOpenReports: 2, daysSinceLastTreatment: 45 },
  },
];
