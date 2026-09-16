/**
 * D-Fence — one-shot generator for the 4.2.5 golden values.
 *
 * Run BEFORE the generalisation, against the v0.8 `PriorityScoringEngine`:
 *   npx tsx tests/fixtures/generate-v08-goldens.ts
 *
 * It prints the scores, tiers and per-driver contributions the v0.8 engine produces for
 * `DENGUE_FIXTURES`. Those numbers are pasted as literals into `tests/pest-compatibility.test.ts`.
 * It is kept in the repository, unmodified, as the provenance of those literals — not as something
 * to re-run after the split, which would defeat the point.
 */
import { PriorityScoringEngine } from '../../src/control/PriorityScoringEngine';
import { NormalisationFactory } from '../../src/control/normalisation/NormalisationFactory';
import { ConfigLoader } from '../../src/config/ConfigLoader';
import type { PriorityScoreStore } from '../../src/ports/Stores';
import { DENGUE_FIXTURES, FIXTURE_NOW } from './dengue-v08';

const config = ConfigLoader.load();
const engine = new PriorityScoringEngine(
  NormalisationFactory.build(config.normalisation),
  config,
  {} as PriorityScoreStore,
);

const ctx = {
  observedMin: Math.min(...DENGUE_FIXTURES.map((f) => f.cluster.caseSize)),
  observedMax: Math.max(
    ...DENGUE_FIXTURES.map((f) => f.cluster.caseSize),
    ...DENGUE_FIXTURES.map((f) => f.cluster.caseDelta ?? 0),
  ),
  now: FIXTURE_NOW,
};

for (const f of DENGUE_FIXTURES) {
  const score = engine.scoreOne(f.cluster, f.inputs, ctx);
  const drivers = score.contributions
    .map((c) => `${c.driver}=${c.normalisedValue.toFixed(6)}`)
    .join(' ');
  console.log(
    [
      f.cluster.id.padEnd(3),
      `score=${score.score.toFixed(1)}`.padEnd(14),
      `tier=${score.tier}`.padEnd(13),
      `excluded=${score.excludedDrivers.length}`,
      drivers,
    ].join(' '),
  );
}
