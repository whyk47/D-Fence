/**
 * D-Fence — Lab 4 §3.2: equivalence-class and boundary-value tests for the cluster feed parser
 * and the driver normalisation bindings.
 *
 * These complement the PriorityScoringEngine suite rather than replacing it: the engine tests cover
 * the scoring rules, and these cover the two places where the *feed's real shape* decides behaviour
 * — 1.1.15/1.1.23 (habitat text, not counts) and 1.1.20/1.1.22 (when to download, what changed).
 *
 * Fixtures are the values actually published on 2026-09-03, so a failure here means either the code
 * broke or NEA changed the contract — both worth knowing.
 */
import { describe, expect, it } from 'vitest';
import { ClusterFeedParser, RawClusterProperties } from '../src/control/ingestion/ClusterFeedParser';
import { NormalisationFactory } from '../src/control/normalisation/NormalisationFactory';
import { Driver } from '../src/entity/enums';
import { NormalisationContext } from '../src/control/normalisation/NormalisationStrategy';

/** The largest cluster in the 2026-09-03 payload, verbatim. */
const COUNTRYSIDE: RawClusterProperties = {
  OBJECTID: 525120,
  LOCALITY: 'Countryside Rd, Walk / Florissa Pk / Lentor Ave',
  CASE_SIZE: 258,
  HOMES: 'Domestic container, Bin, Flower pot, Vase',
  PUBLIC_PLACES: 'Ceramic pot, Discarded plastic cup',
  CONSTRUCTION_SITES: 'Scaffolding, Cement mixer',
  INC_CRC: 'A80EE9CCBD4A394B',
  FMEL_UPD_D: '20260828155154',
};

/** The common case: 8 of 12 clusters on 2026-09-03 listed no habitats at all. */
const BARE: RawClusterProperties = {
  OBJECTID: 525131,
  LOCALITY: 'Punggol Dr (Blk 612A)',
  CASE_SIZE: 2,
  HOMES: null,
  PUBLIC_PLACES: null,
  CONSTRUCTION_SITES: null,
  INC_CRC: 'B11CE9CCBD4A0001',
  FMEL_UPD_D: '20260825155459',
};

const ctx = (min: number, max: number): NormalisationContext => ({
  observedMin: min,
  observedMax: max,
  now: new Date('2026-09-03T00:00:00+08:00'),
});

/**
 * §1 — habitat parsing (1.1.23). Equivalence classes: populated text, empty string, null/absent,
 * and text with the trailing comma the feed actually emits.
 */
describe('EC: habitat lists parse as comma-separated text, not counts (1.1.23)', () => {
  it('H1 — a populated field yields one entry per named habitat', () => {
    expect(ClusterFeedParser.parseHabitatList('Domestic container, Bin, Flower pot')).toEqual([
      'Domestic container',
      'Bin',
      'Flower pot',
    ]);
  });

  it('H2 — null and undefined both yield an empty list, not a thrown error', () => {
    expect(ClusterFeedParser.parseHabitatList(null)).toEqual([]);
    expect(ClusterFeedParser.parseHabitatList(undefined)).toEqual([]);
  });

  it('H3 — a trailing comma does not create a phantom habitat that inflates the denominator', () => {
    expect(ClusterFeedParser.parseHabitatList('Bin, Vase, ')).toHaveLength(2);
  });

  it('H4 — an empty string is an empty list', () => {
    expect(ClusterFeedParser.parseHabitatList('')).toEqual([]);
  });
});

/**
 * §2 — premises mix (1.1.15, 1.1.16). Boundaries are 0 (all habitats in homes) and 1 (none in
 * homes), with the all-empty case pinned separately because it is the majority of real clusters.
 */
describe('BV: premises mix spans [0, 1] and pins at both ends (1.1.15, 1.1.16)', () => {
  it('P1 — habitats only in homes gives exactly 0', () => {
    expect(ClusterFeedParser.computePremisesMix(['Bin', 'Vase'], [], [])).toBe(0);
  });

  it('P2 — habitats only outside homes gives exactly 1', () => {
    expect(ClusterFeedParser.computePremisesMix([], ['Ceramic pot'], ['Scaffolding'])).toBe(1);
  });

  it('P3 — an even split gives 0.5', () => {
    expect(ClusterFeedParser.computePremisesMix(['Bin', 'Vase'], ['Ceramic pot'], ['Scaffolding'])).toBe(0.5);
  });

  it('P4 — all three fields empty gives 0, not a division by zero (1.1.16)', () => {
    expect(ClusterFeedParser.computePremisesMix([], [], [])).toBe(0);
  });

  it('P5 — the real Countryside Rd feature: 4 home, 2 public, 2 construction habitats', () => {
    const parsed = ClusterFeedParser.parseFeature(COUNTRYSIDE, true);
    expect('accepted' in parsed).toBe(true);
    if ('accepted' in parsed) {
      expect(parsed.accepted.premisesMix).toBeCloseTo(0.5, 10);
      expect(parsed.accepted.caseSize).toBe(258);
    }
  });

  it('P6 — a cluster with no habitat text scores 0 on this driver, which is 8 of 12 real clusters', () => {
    const parsed = ClusterFeedParser.parseFeature(BARE, true);
    expect('accepted' in parsed).toBe(true);
    if ('accepted' in parsed) {
      expect(parsed.accepted.premisesMix).toBe(0);
    }
  });
});

/**
 * §3 — rejection (1.1.3, 1.1.4). One invalid class per required field, plus the geometry case,
 * because 1.1.4 obliges the *name* of the missing field to be logged, not merely that it failed.
 */
describe('EC: a feature missing a required field is rejected and names the field (1.1.3, 1.1.4)', () => {
  const cases: Array<[string, RawClusterProperties, boolean, string]> = [
    ['R1 — missing OBJECTID', { ...COUNTRYSIDE, OBJECTID: undefined }, true, 'OBJECTID'],
    ['R2 — blank LOCALITY', { ...COUNTRYSIDE, LOCALITY: '   ' }, true, 'LOCALITY'],
    ['R3 — non-numeric CASE_SIZE', { ...COUNTRYSIDE, CASE_SIZE: 'many' }, true, 'CASE_SIZE'],
    ['R4 — missing geometry', { ...COUNTRYSIDE }, false, 'geometry'],
  ];

  it.each(cases)('%s', (_label, props, geometry, field) => {
    const result = ClusterFeedParser.parseFeature(props, geometry);
    expect('rejected' in result).toBe(true);
    if ('rejected' in result) {
      expect(result.rejected.missingField).toBe(field);
    }
  });

  it('R5 — a CASE_SIZE of 0 is valid data, not a missing field', () => {
    const result = ClusterFeedParser.parseFeature({ ...COUNTRYSIDE, CASE_SIZE: 0 }, true);
    expect('accepted' in result).toBe(true);
  });
});

/**
 * §4 — conditional download (1.1.20) and change detection (1.1.22). Both fail *towards* work:
 * an unknown state must never be recorded as "unchanged", because that freezes the data silently.
 */
describe('EC: the payload is downloaded only when the publisher says it moved (1.1.20)', () => {
  it('D1 — an unchanged lastUpdatedAt skips the download', () => {
    expect(ClusterFeedParser.shouldDownload('2026-09-02T10:06:42+08:00', '2026-09-02T10:06:42+08:00')).toBe(false);
  });

  it('D2 — a moved lastUpdatedAt downloads', () => {
    expect(ClusterFeedParser.shouldDownload('2026-09-03T10:06:42+08:00', '2026-09-02T10:06:42+08:00')).toBe(true);
  });

  it('D3 — no recorded value (first cycle, or after a restart) downloads (10.2.3)', () => {
    expect(ClusterFeedParser.shouldDownload('2026-09-02T10:06:42+08:00', null)).toBe(true);
  });

  it('D4 — an unreadable metadata value downloads rather than silently freezing the data', () => {
    expect(ClusterFeedParser.shouldDownload(null, '2026-09-02T10:06:42+08:00')).toBe(true);
    expect(ClusterFeedParser.shouldDownload('', '2026-09-02T10:06:42+08:00')).toBe(true);
  });
});

describe('EC: per-feature change detection uses the published checksum (1.1.22)', () => {
  it('C1 — an identical INC_CRC is unchanged', () => {
    expect(ClusterFeedParser.featureChanged('A80EE9CCBD4A394B', 'A80EE9CCBD4A394B')).toBe(false);
  });

  it('C2 — a different INC_CRC is changed', () => {
    expect(ClusterFeedParser.featureChanged('A80EE9CCBD4A394B', 'FFFFFFFFFFFFFFFF')).toBe(true);
  });

  it('C3 — a never-before-seen feature is changed', () => {
    expect(ClusterFeedParser.featureChanged('A80EE9CCBD4A394B', null)).toBe(true);
  });

  it('C4 — a feature the publisher sent without a checksum is treated as changed, not as unchanged', () => {
    expect(ClusterFeedParser.featureChanged(null, 'A80EE9CCBD4A394B')).toBe(true);
  });
});

describe('EC/BV: FMEL_UPD_D parses as Singapore local time', () => {
  it('T1 — the real 2026-08-28 stamp resolves to 15:51:54 SGT', () => {
    const parsed = ClusterFeedParser.parseFeedTimestamp('20260828155154');
    expect(parsed?.toISOString()).toBe('2026-08-28T07:51:54.000Z');
  });

  it('T2 — a malformed stamp is null, not an Invalid Date that silently propagates', () => {
    expect(ClusterFeedParser.parseFeedTimestamp('28-08-2026')).toBeNull();
    expect(ClusterFeedParser.parseFeedTimestamp(null)).toBeNull();
  });
});

/**
 * §5 — the binding 4.1.3 requires. This is the test that would have caught the real defect:
 * Rainfall72h and VerifiedOpenReportCount had no strategy at all, so a full scoring cycle would
 * have thrown at run time.
 */
describe('EC: every driver named by 4.1.3 has a normalisation strategy (4.1.4)', () => {
  it('F1 — the factory binds all seven drivers, each to itself', () => {
    const map = NormalisationFactory.build();
    for (const driver of Object.values(Driver)) {
      const strategy = map.get(driver);
      expect(strategy, `no strategy for ${driver}`).toBeDefined();
      expect(strategy?.driver()).toBe(driver);
    }
    expect(map.size).toBe(7);
  });

  it('F2 — the two rainfall windows share a method but not a cap (SCORING-SPEC §2.2)', () => {
    const map = NormalisationFactory.build();
    const r24 = map.get(Driver.Rainfall24h)!;
    const r72 = map.get(Driver.Rainfall72h)!;
    // 60 mm saturates the 24-hour driver but is only half of the 72-hour cap.
    expect(r24.normalise(60, ctx(0, 100))).toBe(1);
    expect(r72.normalise(60, ctx(0, 100))).toBeCloseTo(0.5, 10);
  });

  it('F3 — case size now uses the log strategy, so 61 cases no longer collapses towards 0', () => {
    const map = NormalisationFactory.build();
    const caseSize = map.get(Driver.CaseSize)!;
    // Min-max put this at 0.230 against a 258-case observed maximum. Log against the fixed
    // reference ceiling of 300 puts it at 0.720.
    expect(caseSize.normalise(61, ctx(2, 258))).toBeCloseTo(0.72, 2);
  });

  it('F6 — the same raw value scores the same tomorrow, whatever the day\'s population (4.1.11)', () => {
    const caseSize = NormalisationFactory.build().get(Driver.CaseSize)!;
    // Today's largest cluster is 258; tomorrow a 500-case cluster appears and a small one closes.
    // The 61-case cluster must not move merely because its neighbours did.
    const today = caseSize.normalise(61, ctx(2, 258));
    const tomorrow = caseSize.normalise(61, ctx(5, 500));
    expect(tomorrow).toBe(today);
  });

  it('F7 — a cluster at the reference ceiling saturates at 1.0', () => {
    const caseSize = NormalisationFactory.build({ caseSizeReferenceMax: 300 }).get(Driver.CaseSize)!;
    expect(caseSize.normalise(300, ctx(2, 258))).toBe(1);
    expect(caseSize.normalise(900, ctx(2, 258))).toBe(1);
  });

  it('F4 — an untreated cluster (4.1.16 default of 90 days) enters this driver saturated at 1.0', () => {
    const map = NormalisationFactory.build();
    expect(map.get(Driver.DaysSinceLastTreatment)!.normalise(90, ctx(0, 90))).toBe(1);
  });

  it('F5 — parameters are configuration, not constants: a different cap changes the value', () => {
    const map = NormalisationFactory.build({ rainfall24hCapMm: 25 });
    expect(map.get(Driver.Rainfall24h)!.normalise(25, ctx(0, 100))).toBe(1);
  });
});
