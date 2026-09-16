/**
 * D-Fence — the urgency half of the priority score.
 * Stereotype: <<control>>. Traces: 4.1.3, 4.1.4, 4.1.7, 4.1.10, 4.1.12, 4.1.13, 4.1.19, 4.1.20,
 * 4.1.21, 4.1.22-4.1.26, 4.3.4-4.3.6, 4.3.10.
 *
 * This is v0.8's `PriorityScoringEngine.applyWeights` and `buildBreakdown`, unchanged in substance
 * and generalised in one respect only: **which** drivers are summed is now read from the scored
 * pest's evidence tier rather than fixed at seven (4.1.3 as revised). Everything else — the
 * Strategy-per-driver normalisation, the renormalisation after an excluded driver, the stored
 * breakdown — is the v0.8 behaviour, and 4.2.5 is the test that says so.
 *
 * It returns a value in [0, 1], not a score. `PestPriorityCalculator` multiplies it by severity and
 * puts it on the 0-100 scale (4.2.4). Splitting there is deliberate: urgency is "how bad is it here,
 * right now", severity is "how bad is this pest, ever", and they are argued from different evidence.
 */
import { Driver } from '../../entity/enums';
import { DriverContribution } from '../../entity/DriverContribution';
import { PestProfile } from '../../entity/PestProfile';
import { NormalisationContext, NormalisationStrategy } from '../normalisation/NormalisationStrategy';

/**
 * The driver inputs a scoring cycle needs that do not live on the scored subject — rainfall
 * accumulations, report counts, treatment recency, observation density. Fetched in bulk before the
 * loop (10.1.3 bounds a 500-subject cycle at 60 seconds), which is why they arrive as a map rather
 * than being looked up per subject inside the calculator.
 *
 * An absent value is absent, not zero (4.1.12, 4.1.13): a rainfall feed that is down must not read
 * as a dry locality.
 */
export interface DriverInputs {
  caseSize?: number;
  caseGrowthDelta?: number;
  rainfall24h?: number;
  rainfall72h?: number;
  verifiedOpenReports?: number;
  daysSinceLastTreatment?: number;
  premisesMix?: number;
  /** 4.1.22 */
  reportVelocity?: number;
  /** 4.1.23 */
  corroborationDensity?: number;
  /** 4.1.24. 4.1.26: label this "recent wildlife activity", never "pest pressure". */
  externalObservationDensity?: number;
  /** 4.1.25 — metres to the nearest registered operator (1.6.8). */
  responseCapacityDeficit?: number;
}

export interface UrgencyResult {
  /** [0, 1]. 4.1.7 as revised — the weighted sum is now an intermediate value. */
  readonly urgency: number;
  readonly contributions: DriverContribution[];
  /** 4.1.20 — the drivers this subject's tier allows but which had no value this cycle. */
  readonly excludedDrivers: Driver[];
}

/** Maps a driver onto the field of `DriverInputs` that carries it. One place, so a new driver is
 *  one line here and one line in the enum rather than a search through the scorer. */
const INPUT_FIELD: Readonly<Record<Driver, keyof DriverInputs>> = {
  [Driver.CaseSize]: 'caseSize',
  [Driver.CaseGrowthDelta]: 'caseGrowthDelta',
  [Driver.Rainfall24h]: 'rainfall24h',
  [Driver.Rainfall72h]: 'rainfall72h',
  [Driver.VerifiedOpenReportCount]: 'verifiedOpenReports',
  [Driver.DaysSinceLastTreatment]: 'daysSinceLastTreatment',
  [Driver.PremisesMix]: 'premisesMix',
  [Driver.ReportVelocity]: 'reportVelocity',
  [Driver.CorroborationDensity]: 'corroborationDensity',
  [Driver.ExternalObservationDensity]: 'externalObservationDensity',
  [Driver.ResponseCapacityDeficit]: 'responseCapacityDeficit',
};

export class UrgencyCalculator {
  constructor(private readonly strategies: Map<Driver, NormalisationStrategy>) {}

  /** Drivers whose source is stale this cycle. 4.1.12 excludes them; 4.1.20 names them. */
  private staleDrivers = new Set<Driver>();

  markStale(drivers: Driver[]): void {
    this.staleDrivers = new Set(drivers);
  }

  /** 4.3.4-4.3.6 — the drivers the given profile's evidence tier permits. */
  driversFor(profile: PestProfile): readonly Driver[] {
    return profile.drivers();
  }

  computeUrgency(
    profile: PestProfile,
    inputs: DriverInputs,
    ctx: NormalisationContext,
  ): UrgencyResult {
    const contributions = this.buildBreakdown(profile, inputs, ctx);
    const present = new Set(contributions.map((c) => c.driver));
    // Only the drivers this TIER has. Iterating the Driver enum here — which v0.8 could get away
    // with, because every subject was a mosquito — would mark every tier C score degraded for four
    // drivers it can never have.
    const excludedDrivers = profile.drivers().filter((d) => !present.has(d));
    return { urgency: this.applyWeights(contributions), contributions, excludedDrivers };
  }

  /**
   * One contribution per available driver, each recording raw, normalised, weight and product.
   * 4.1.10 requires the breakdown to be **stored**, not recomputed at display time, which is also
   * what makes 4.1.18's "explain this score" answerable months later.
   */
  private buildBreakdown(
    profile: PestProfile,
    inputs: DriverInputs,
    ctx: NormalisationContext,
  ): DriverContribution[] {
    const out: DriverContribution[] = [];
    for (const driver of profile.drivers()) {
      const value = inputs[INPUT_FIELD[driver]];
      if (value === undefined || Number.isNaN(value) || this.staleDrivers.has(driver)) {
        continue;
      }
      const strategy = this.strategies.get(driver);
      const weight = profile.driverWeights.get(driver);
      if (strategy === undefined || weight === undefined) {
        // Fails loudly rather than scoring without the driver: an unbound driver is a wiring
        // defect, and a silently smaller score is the hardest kind of bug to notice.
        throw new Error(
          `driver ${driver} has no ${strategy === undefined ? 'strategy' : 'weight'} ` +
            `for ${profile.pestType} (4.1.3, 4.3.7)`,
        );
      }
      const contribution = new DriverContribution();
      contribution.driver = driver;
      contribution.rawValue = value;
      contribution.normalisedValue = strategy.normalise(value, ctx);
      contribution.weight = weight;
      contribution.contribution = contribution.normalisedValue * weight;
      out.push(contribution);
    }
    return out;
  }

  /**
   * 4.1.7 as revised: the weighted sum of the normalised drivers, in [0, 1].
   *
   * 4.3.7 requires a tier's weights to sum to 1.0, asserted at load. So the sum of the *present*
   * weights here is the share of the score that was computable, and dividing by it is 4.1.19 —
   * renormalising the remaining weights to 1.0 after a driver is excluded under 4.1.12. Without
   * that division a stale rainfall feed would not merely remove a driver, it would push every score
   * down and reorder the whole dashboard.
   */
  private applyWeights(contributions: DriverContribution[]): number {
    if (contributions.length === 0) {
      return 0;
    }
    const weightPresent = contributions.reduce((sum, c) => sum + c.weight, 0);
    if (weightPresent <= 0) {
      return 0;
    }
    const weighted = contributions.reduce((sum, c) => sum + c.normalisedValue * c.weight, 0);
    return weighted / weightPresent;
  }
}
