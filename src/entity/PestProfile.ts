/**
 * D-Fence — entity class `PestProfile`
 * Stereotype: <<entity>>. Traces: 4.2.1, 4.2.2, 4.2.3, 4.2.6, 4.2.7, 4.3.1-4.3.8, 8.6.2, 8.6.3, 1.5.2
 *
 * Configuration, not user data. It is an entity because scoring reads it like any other, but it is
 * loaded from `config/pests.default.json` (4.2.2, 10.6.2) and no use case writes it. That separation
 * is the point of the whole generalisation: widening the product to a new pest is a configuration
 * change and a severity argument, not a code change.
 */
import { Driver, EvidenceTier, PestClass, PestType } from './enums';

/** 4.3.4 — the v0.8 seven, unchanged. 4.2.5 depends on this list and its order. */
export const TIER_A_DRIVERS: readonly Driver[] = [
  Driver.CaseSize,
  Driver.CaseGrowthDelta,
  Driver.Rainfall24h,
  Driver.Rainfall72h,
  Driver.VerifiedOpenReportCount,
  Driver.DaysSinceLastTreatment,
  Driver.PremisesMix,
];

/** 4.3.5 — no case count and no rainfall: neither exists outside the dengue feed. */
export const TIER_B_DRIVERS: readonly Driver[] = [
  Driver.VerifiedOpenReportCount,
  Driver.ReportVelocity,
  Driver.ExternalObservationDensity,
  Driver.DaysSinceLastTreatment,
  Driver.CorroborationDensity,
  Driver.ResponseCapacityDeficit,
];

/** 4.3.6 — tier B without the external feed. 4.3.10: this set needs no external source at all. */
export const TIER_C_DRIVERS: readonly Driver[] = [
  Driver.VerifiedOpenReportCount,
  Driver.ReportVelocity,
  Driver.DaysSinceLastTreatment,
  Driver.CorroborationDensity,
  Driver.ResponseCapacityDeficit,
];

export function driversFor(tier: EvidenceTier): readonly Driver[] {
  switch (tier) {
    case EvidenceTier.A:
      return TIER_A_DRIVERS;
    case EvidenceTier.B:
      return TIER_B_DRIVERS;
    case EvidenceTier.C:
      return TIER_C_DRIVERS;
    default:
      throw new Error(`unknown evidence tier ${tier} (4.3.1)`);
  }
}

export class PestProfile {
  constructor(
    readonly pestType: PestType,
    readonly pestClass: PestClass,
    readonly evidenceTier: EvidenceTier,
    /** 4.2.1 — in (0, 1], normalised against the most severe pest in the catalogue. */
    readonly severityMultiplier: number,
    readonly driverWeights: ReadonlyMap<Driver, number>,
    readonly dispatchAuthority: string,
    readonly authorityContactNumber: string,
    /** 1.5.2 — required when the tier is B, null otherwise. */
    readonly observationTaxonId: number | null = null,
  ) {}

  /** 4.3.4-4.3.6 — the drivers this pest is allowed to be scored on. */
  drivers(): readonly Driver[] {
    return driversFor(this.evidenceTier);
  }

  /** 8.1.14, 8.6.1 — wildlife is referred, never dispatched to a Cleaning Crew. */
  isReferrable(): boolean {
    return this.pestClass === PestClass.Wildlife;
  }

  /**
   * 4.2.6, 4.3.7, 4.3.8 — everything a single profile can be wrong about, checked in one place so
   * the failure names the pest rather than surfacing as a strange score three layers away.
   * @returns the reasons it is invalid; empty when the profile is sound.
   */
  problems(): string[] {
    const out: string[] = [];
    if (!(this.severityMultiplier > 0) || this.severityMultiplier > 1) {
      out.push(
        `${this.pestType}: severity multiplier ${this.severityMultiplier} is outside (0, 1] (4.2.6)`,
      );
    }
    if (this.driverWeights.size === 0) {
      out.push(`${this.pestType}: no driver weights (4.3.7)`);
    } else {
      const sum = [...this.driverWeights.values()].reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 1e-9) {
        out.push(`${this.pestType}: driver weights sum to ${sum}, must sum to 1.0 (4.3.7)`);
      }
    }
    const permitted = new Set(this.drivers());
    for (const driver of this.driverWeights.keys()) {
      if (!permitted.has(driver)) {
        out.push(
          `${this.pestType}: driver ${driver} is not available to evidence tier ` +
            `${this.evidenceTier} (4.3.8)`,
        );
      }
    }
    for (const driver of permitted) {
      if (!this.driverWeights.has(driver)) {
        // A driver with no weight contributes nothing — a scoring change disguised as an omission.
        out.push(`${this.pestType}: no weight for driver ${driver} (4.3.7)`);
      }
    }
    if (this.evidenceTier === EvidenceTier.B && this.observationTaxonId === null) {
      out.push(`${this.pestType}: evidence tier B requires an observation taxon id (1.5.2)`);
    }
    if (this.dispatchAuthority.trim() === '') {
      out.push(`${this.pestType}: no dispatch authority (4.2.3)`);
    }
    return out;
  }
}
