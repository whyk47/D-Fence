/**
 * D-Fence — runtime configuration.
 * Traces: 4.1.5, 4.1.6, 4.1.9, 10.6.2 (weights and thresholds outside the code), 10.3.4 (secrets
 * outside the repository).
 *
 * Values come from two places, deliberately separated: `config/scoring.default.json` holds the
 * tunable model — weights, thresholds, normalisation parameters, dataset ids — and is committed,
 * because the team must be able to see and argue over it. Secrets come from the environment only
 * and are never written into a committed file.
 */
import { Driver, EvidenceTier, PestClass, PestType, SourceKind } from '../entity/enums';
import { TierThresholds } from '../entity/valueTypes';
import { NormalisationParameters } from '../control/normalisation/NormalisationFactory';
import { PestProfile, TIER_A_DRIVERS } from '../entity/PestProfile';
import { CriticalOverrideRule } from '../control/scoring/CriticalOverrideEvaluator';

export interface ClusterSourceConfig {
  datasetId: string;
  metadataBaseUrl: string;
  downloadBaseUrl: string;
}

export class ConfigSet {
  /** 4.1.5. Justified per driver in SCORING-SPEC.md §3. */
  readonly driverWeights = new Map<Driver, number>();
  /** 4.1.8/4.1.9 tier cut-offs; the Lab 4 boundary-value cases sit exactly on these. */
  tierThresholds: TierThresholds = new TierThresholds(70, 40);
  /** rainfall 5 min, clusters hourly, forecast 6 h. Seconds. */
  readonly ingestionIntervals = new Map<SourceKind, number>();
  /** SCORING-SPEC.md §2 — caps and reference ceilings. */
  normalisation: NormalisationParameters = {};
  /** 4.2.2, 4.2.3 — the pest catalogue, from `config/pests.default.json`. */
  readonly pestProfiles = new Map<PestType, PestProfile>();
  /** 4.4.2 — the critical override rules, from the same file. */
  criticalOverrideRules: CriticalOverrideRule[] = [];
  clusterSource: ClusterSourceConfig = {
    datasetId: 'd_dbfabf16158d1b0e1c420627c0819168',
    metadataBaseUrl: 'https://api-production.data.gov.sg',
    downloadBaseUrl: 'https://api-open.data.gov.sg',
  };

  /**
   * 4.2.3 — the profile for one pest.
   *
   * The mosquito falls back to a profile assembled from `driverWeights` when no catalogue has been
   * loaded. That fallback is not a convenience: it is what makes 4.2.5 hold in a unit test that
   * constructs a bare ConfigSet, as every Lab 4 §2 case does. severityMultiplier 1.0 and the tier A
   * driver set are the two facts that make the mosquito branch numerically identical to v0.8.
   */
  pestProfile(pestType: PestType): PestProfile {
    const configured = this.pestProfiles.get(pestType);
    if (configured !== undefined) {
      return configured;
    }
    if (pestType === PestType.Mosquito) {
      return new PestProfile(
        PestType.Mosquito,
        PestClass.VectorBorne,
        EvidenceTier.A,
        1.0,
        this.driverWeights,
        'NEA',
        '6225 5632',
        null,
      );
    }
    throw new Error(`no pest profile configured for ${pestType} (4.2.3)`);
  }

  /**
   * 4.2.6, 4.2.7, 4.3.7, 4.3.8 — the catalogue as a whole.
   *
   * 4.2.7 is the one worth reading twice. The severity multipliers are normalised against the most
   * severe pest in the catalogue, and the tier thresholds at 40.0 and 70.0 mean what
   * SCORING-SPEC.md §4 says they mean only while that holds. A catalogue in which every multiplier
   * had been scaled down by a constant factor would still rank pests correctly against each other
   * and would quietly make every score, every tier and every alert wrong.
   */
  validatePestProfiles(): void {
    if (this.pestProfiles.size === 0) {
      throw new Error('no pest profiles configured (4.2.3)');
    }
    const problems = [...this.pestProfiles.values()].flatMap((p) => p.problems());
    if (![...this.pestProfiles.values()].some((p) => p.severityMultiplier === 1.0)) {
      problems.push(
        'no pest carries a severity multiplier of 1.0: the catalogue is not normalised against ' +
          'its most severe pest, so the tier thresholds in 4.1.8 no longer mean what they meant (4.2.7)',
      );
    }
    if (this.criticalOverrideRules.length === 0) {
      throw new Error('no critical override rules configured (4.4.1, 4.4.2)');
    }
    if (problems.length > 0) {
      throw new Error(`pest profile configuration is invalid:\n  ${problems.join('\n  ')}`);
    }
  }

  /** Environment values, loaded by AppConfigurator. Secrets live here and nowhere else. */
  private readonly env = new Map<string, string>();

  setEnv(key: string, value: string): void {
    this.env.set(key, value);
  }

  /** @returns the value, or an empty string when unset — for optional settings only. */
  get(key: string): string {
    return this.env.get(key) ?? '';
  }

  /** Throws rather than defaulting: a missing secret must fail at startup, not at first use. */
  require(key: string): string {
    const value = this.env.get(key);
    if (value === undefined || value === '') {
      throw new Error(`configuration value '${key}' is not set (10.3.4)`);
    }
    return value;
  }

  requireNumber(key: string): number {
    const raw = this.require(key);
    const value = Number(raw);
    if (Number.isNaN(value)) {
      throw new Error(`configuration value '${key}' is not a number: ${raw}`);
    }
    return value;
  }

  /**
   * 4.1.6: the weights must sum to 1.0. Checked at load rather than at scoring time, because a
   * mis-set weight that is only noticed during a scoring cycle has already produced wrong output.
   * The tolerance is for floating-point addition, not for sloppy configuration.
   */
  validate(): void {
    const weights = [...this.driverWeights.values()];
    if (weights.length === 0) {
      throw new Error('no driver weights configured (4.1.5)');
    }
    const sum = weights.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-9) {
      throw new Error(`driver weights sum to ${sum}, must sum to 1.0 (4.1.6)`);
    }
    if (this.tierThresholds.medium >= this.tierThresholds.high) {
      throw new Error('tier thresholds must satisfy medium < high');
    }
  }

  /**
   * 4.3.4 completeness, checked at bootstrap rather than inside validate().
   *
   * Kept separate on purpose: `validate()` enforces exactly what 4.1.6 says — the weights sum to
   * 1.0 — and a partial weight map is a legitimate thing to validate in a unit test (Lab 4 cases
   * W1–W5 do exactly that). A *running system*, though, must have all seven drivers weighted: a
   * driver with no weight contributes nothing, which is a scoring change disguised as a
   * configuration omission.
   */
  validateComplete(): void {
    this.validate();
    // TIER_A_DRIVERS, not every member of the Driver enum. `driverWeights` is the *tier A* weight
    // set — the v0.8 seven, which 4.2.5 keeps unchanged. The four drivers v0.9 added belong to
    // tiers B and C and are weighted per pest in `pestProfiles`; demanding a tier A weight for
    // ExternalObservationDensity would refuse a correct configuration at startup.
    const missing = TIER_A_DRIVERS.filter((d) => !this.driverWeights.has(d));
    if (missing.length > 0) {
      throw new Error(`no weight configured for ${missing.join(', ')} (4.3.4, 4.1.5)`);
    }
  }
}
