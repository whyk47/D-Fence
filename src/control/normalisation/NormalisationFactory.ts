/**
 * D-Fence — NormalisationFactory.
 * Stereotype: <<control>>. Traces: 4.1.3, 4.1.4, 10.6.2.
 *
 * One place that binds each of the seven drivers named by 4.1.3 to the method documented for it in
 * SCORING-SPEC.md §2. It exists because the binding was previously implicit in seven separate
 * classes, and two drivers — Rainfall72h and VerifiedOpenReportCount — had no strategy at all, so a
 * score computed over them would have thrown at run time rather than at wiring time.
 *
 * `build()` asserts completeness: every member of the Driver enum must resolve to a strategy, and a
 * strategy must report the driver it was bound to. A missing binding is a configuration defect and
 * fails at startup, not mid-cycle.
 */
import { Driver } from '../../entity/enums';
import { NormalisationStrategy } from './NormalisationStrategy';
import { LogScaleNormalisation } from './LogScaleNormalisation';
import { CappedLinearNormalisation } from './CappedLinearNormalisation';
import { RecencyDecayNormalisation } from './RecencyDecayNormalisation';
import { PremisesMixNormalisation } from './PremisesMixNormalisation';

/** Parameters that live in configuration (10.6.2), defaulted to the SCORING-SPEC.md §2 values. */
export interface NormalisationParameters {
  /** Fixed ceiling for the case-size driver. Fixed, not observed, so scores compare across days. */
  caseSizeReferenceMax?: number;
  /** Fixed ceiling for the growth driver, in new cases since the previous snapshot. */
  caseGrowthReferenceMax?: number;
  rainfall24hCapMm?: number;
  rainfall72hCapMm?: number;
  openReportCap?: number;
  treatmentSaturationDays?: number;
}

export const DEFAULT_NORMALISATION: Required<NormalisationParameters> = {
  // 300 cases is above the largest cluster seen on 2026-09-03 (258) with headroom. A cluster at or
  // above the reference saturates this driver at 1.0, which is the intended reading.
  caseSizeReferenceMax: 300,
  caseGrowthReferenceMax: 40,
  rainfall24hCapMm: 50,
  rainfall72hCapMm: 120,
  openReportCap: 5,
  treatmentSaturationDays: 60,
};

export class NormalisationFactory {
  static build(params: NormalisationParameters = {}): Map<Driver, NormalisationStrategy> {
    const p = { ...DEFAULT_NORMALISATION, ...params };
    const strategies: NormalisationStrategy[] = [
      // Case size moved from min-max to log on the 2026-09-03 payload evidence (SCORING-SPEC §2.1).
      // Both log drivers take a FIXED reference ceiling, not the observed maximum: 4.1.11 keeps
      // scores as history and 4.1.17 compares them across cycles, so a ceiling that moves with
      // today's population would make yesterday's score mean something different.
      new LogScaleNormalisation(Driver.CaseSize, p.caseSizeReferenceMax),
      new LogScaleNormalisation(Driver.CaseGrowthDelta, p.caseGrowthReferenceMax),
      new CappedLinearNormalisation(Driver.Rainfall24h, p.rainfall24hCapMm),
      new CappedLinearNormalisation(Driver.Rainfall72h, p.rainfall72hCapMm),
      new CappedLinearNormalisation(Driver.VerifiedOpenReportCount, p.openReportCap),
      new RecencyDecayNormalisation(p.treatmentSaturationDays),
      new PremisesMixNormalisation(),
    ];

    const map = new Map<Driver, NormalisationStrategy>();
    for (const s of strategies) {
      if (map.has(s.driver())) {
        throw new Error(`two strategies bound to driver ${s.driver()}`);
      }
      map.set(s.driver(), s);
    }

    const missing = Object.values(Driver).filter((d) => !map.has(d));
    if (missing.length > 0) {
      // 4.1.3 names exactly seven drivers. An unbound driver would surface as a thrown error inside
      // a scoring cycle, which is the worst place to find it.
      throw new Error(`no normalisation strategy for ${missing.join(', ')} (4.1.3, 4.1.4)`);
    }
    return map;
  }
}
