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
import { Driver, SourceKind } from '../entity/enums';
import { TierThresholds } from '../entity/valueTypes';
import { NormalisationParameters } from '../control/normalisation/NormalisationFactory';

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
  clusterSource: ClusterSourceConfig = {
    datasetId: 'd_dbfabf16158d1b0e1c420627c0819168',
    metadataBaseUrl: 'https://api-production.data.gov.sg',
    downloadBaseUrl: 'https://api-open.data.gov.sg',
  };

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
   * 4.1.3 completeness, checked at bootstrap rather than inside validate().
   *
   * Kept separate on purpose: `validate()` enforces exactly what 4.1.6 says — the weights sum to
   * 1.0 — and a partial weight map is a legitimate thing to validate in a unit test (Lab 4 cases
   * W1–W5 do exactly that). A *running system*, though, must have all seven drivers weighted: a
   * driver with no weight contributes nothing, which is a scoring change disguised as a
   * configuration omission.
   */
  validateComplete(): void {
    this.validate();
    const missing = Object.values(Driver).filter((d) => !this.driverWeights.has(d));
    if (missing.length > 0) {
      throw new Error(`no weight configured for ${missing.join(', ')} (4.1.3, 4.1.5)`);
    }
  }
}
