/**
 * D-Fence — the critical override.
 * Stereotype: <<control>>. Traces: 4.4.1, 4.4.2, 4.4.3, 4.4.6, 4.4.7, 4.4.8.
 *
 * This class exists because a linear weighted sum cannot express acute life-safety, and requirement
 * group 4.4 exists so that it is not asked to. A venomous snake in a corridor in a locality with two
 * reports scores low, and is *right* to score low: the evidence really is thin. It is still the
 * thing the Operations Manager must see first. So the override raises the tier and leaves the score
 * alone (4.4.5, applied by `PestPriorityCalculator.withOverride`).
 *
 * The rules are configuration (4.4.2), not code, for the same reason the weights are: the team must
 * be able to argue about them without a deployment.
 */
import { LocationContext, PestClass } from '../../entity/enums';
import { Report } from '../../entity/Report';
import { PestProfile } from '../../entity/PestProfile';
import { OverrideOutcome } from './PestPriorityCalculator';

/** One rule from `config/pests.default.json`. A field left undefined does not constrain. */
export interface CriticalOverrideRule {
  readonly name: string;
  readonly description: string;
  readonly pestClass?: PestClass;
  readonly locationContext?: LocationContext;
  readonly injuryReported?: boolean;
}

export class CriticalOverrideEvaluator {
  constructor(private readonly rules: readonly CriticalOverrideRule[]) {
    if (rules.length === 0) {
      // 4.4.2 loads the rules from configuration, and an override that silently fails to load looks
      // exactly like an override that never matched. Every other failure in this class is loud;
      // this one would be silent, so it is refused at construction rather than at evaluation.
      throw new Error('no critical override rules configured (4.4.1, 4.4.2)');
    }
  }

  /**
   * 4.4.1 — evaluated against **verified** reports only. An unverified report has not been through
   * moderation, and a Critical tier that anyone could trigger by filing a report is a denial of
   * service against the manager's attention.
   *
   * @returns every rule that matched (4.4.6 names them all, not just the first)
   */
  evaluate(reports: readonly Report[], profile: PestProfile): OverrideOutcome {
    const names: string[] = [];
    for (const rule of this.rules) {
      if (reports.some((r) => this.matches(r, rule, profile))) {
        names.push(rule.name);
      }
    }
    return { ruleNames: names };
  }

  private matches(report: Report, rule: CriticalOverrideRule, profile: PestProfile): boolean {
    if (!report.isVerified()) {
      return false;
    }
    if (report.pestType !== profile.pestType) {
      return false;
    }
    if (rule.pestClass !== undefined && profile.pestClass !== rule.pestClass) {
      return false;
    }
    if (rule.locationContext !== undefined && report.locationContext !== rule.locationContext) {
      return false;
    }
    if (rule.injuryReported !== undefined && report.injuryReported !== rule.injuryReported) {
      return false;
    }
    return true;
  }

  /** 4.4.6 — the human-readable reason shown on the row. */
  describe(names: readonly string[]): string {
    return names
      .map((n) => this.rules.find((r) => r.name === n)?.description ?? n)
      .join('; ');
  }

  /** 8.1.14 / 4.4.7 read the same fact from different places; one helper keeps them agreeing. */
  static isWildlifeIndoors(report: Report, profile: PestProfile): boolean {
    return (
      profile.pestClass === PestClass.Wildlife &&
      report.locationContext === LocationContext.Indoor
    );
  }
}
