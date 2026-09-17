/**
 * D-Fence — CrossPestScoringService.
 * Stereotype: <<control>>. Traces: 4.1.22-4.1.26, 4.2.1-4.2.4, 4.3.4-4.3.6, 4.4.3, 1.5.9, 1.6.8.
 *
 * Scores every (locality, pest) pair that has evidence, for every pest except the mosquito.
 *
 * **Why the mosquito is excluded, explicitly.** `PriorityScoringEngine` is the tier A cycle and is
 * what 4.2.5's frozen goldens were cut from. Scoring the mosquito here as well would produce two
 * scores for the same subject in one cycle, from two code paths, and the one that happened to be
 * written second would win. One subject, one scorer.
 *
 * **What counts as evidence.** A pest is scored in a locality when that locality has at least one
 * report of it, or at least one admitted observation of it. The alternative — scoring all 22 pests
 * in every locality every cycle — would publish a ranked queue of several hundred rows, almost all
 * of them zero, and 7.2.x would show an Operations Manager a screenful of nothing. A pair with no
 * evidence is not a low priority; it is not a subject.
 */
import { Cluster } from '../../entity/Cluster';
import { PriorityScore } from '../../entity/PriorityScore';
import { PestProfile } from '../../entity/PestProfile';
import { ObservationStore, OperatorRegistryStore, PestReportCounts, pestReportKey, ReportStore, TreatmentRecordStore } from '../../ports/Stores';
import { PestType, ReportStatus } from '../../entity/enums';
import { Report } from '../../entity/Report';
import { DriverInputs } from './UrgencyCalculator';
import { PestPriorityCalculator } from './PestPriorityCalculator';
import { CriticalOverrideEvaluator } from './CriticalOverrideEvaluator';
import { OperatorRegistryLoader } from '../OperatorRegistryLoader';
import { NormalisationContext } from '../normalisation/NormalisationStrategy';

/** 4.1.24 — the observation window, matching 1.5.5's so the driver counts what was ingested. */
const OBSERVATION_WINDOW_DAYS = 90;
/** 4.1.23 — the velocity window. */
const VELOCITY_WINDOW_DAYS = 14;

export class CrossPestScoringService {
  constructor(
    private readonly calculator: PestPriorityCalculator,
    private readonly reports: ReportStore,
    private readonly observations: ObservationStore,
    private readonly registry: OperatorRegistryStore,
    private readonly treatments: TreatmentRecordStore,
    /**
     * 4.4.1–4.4.6. Optional only so that a unit test can score without it; the running system
     * always supplies one.
     *
     * The override is applied *here*, in the cycle, and that is the point of this parameter. Until
     * now `CriticalOverrideEvaluator` and `PestPriorityCalculator.withOverride` were reached by
     * nothing but their own tests: requirement group 4.4 was implemented, tested, green, and never
     * executed against a real score. A venomous snake indoors would have been ranked on its two
     * reports like any other thin case, which is the exact outcome 4.4 exists to prevent.
     */
    private readonly override: CriticalOverrideEvaluator | null = null,
  ) {}

  /**
   * @param profiles the catalogue, from configuration (10.6.2).
   * @returns one score per (locality, pest) pair with evidence, unranked — ranking is
   *   `PriorityRanking`'s job and it has to see the mosquito scores too.
   */
  async scoreAll(
    localities: Cluster[],
    profiles: ReadonlyMap<PestType, PestProfile>,
    ctx: NormalisationContext,
  ): Promise<PriorityScore[]> {
    const now = ctx.now;
    const velocitySince = new Date(now.getTime() - VELOCITY_WINDOW_DAYS * 86_400_000);
    const observationSince = new Date(now.getTime() - OBSERVATION_WINDOW_DAYS * 86_400_000);

    // Three reads for the whole cycle rather than three per pair. With 22 pests and a dozen
    // localities the per-pair version is upwards of 700 round trips for data that does not change
    // while the cycle runs.
    const reportCounts = await this.reports.reportDriversByLocalityAndPest(velocitySince);
    const operators = await this.registry.registry();
    // 4.4.1 — verified reports only, and every one of them, whenever it was filed. An override is
    // not windowed: a snake reported indoors three months ago and never dealt with is still indoors.
    // One read for the cycle, grouped once, for the same reason the counts are.
    const verified = this.override === null ? new Map<string, Report[]>() : await this.verifiedByPair();

    const scores: PriorityScore[] = [];
    for (const locality of localities) {
      // 1.6.8 — computed once per locality, not once per pest: the nearest operator is a property
      // of the place, and every pest in it gets the same answer.
      const nearestOperatorM = OperatorRegistryLoader.nearestOperatorMetres(
        locality.boundary.centroid(),
        operators,
      );
      const daysSinceTreatment = await this.treatments.daysSinceLastTreatment(locality.id, now);

      for (const profile of profiles.values()) {
        if (profile.pestType === PestType.Mosquito) {
          continue; // scored by the tier A cycle; see the note at the top of this file.
        }
        const key = pestReportKey(locality.id, profile.pestType);
        const counts = reportCounts.get(key) ?? null;
        const observed = await this.observationCount(profile, locality.id, observationSince);
        if (!CrossPestScoringService.hasEvidence(counts, observed)) {
          continue;
        }
        const score = this.calculator.score(
          { localityId: locality.id, locality: locality.locality, pestType: profile.pestType },
          profile,
          this.inputsFor(profile, counts, observed, daysSinceTreatment, nearestOperatorM),
          ctx,
        );
        // 4.4.3–4.4.5 — the tier is raised, the score is not. `withOverride` returns the score
        // untouched when nothing matched, so this is unconditional rather than guarded.
        if (this.override !== null) {
          this.calculator.withOverride(score, this.override.evaluate(verified.get(key) ?? [], profile));
        }
        scores.push(score);
      }
    }
    return scores;
  }

  /**
   * 4.1.24 — tier B only. Asking the store for a tier C pest would be a wasted query whose answer
   * is always discarded, because 4.3.6 does not give tier C an observation driver.
   */
  private async observationCount(
    profile: PestProfile,
    localityId: string,
    since: Date,
  ): Promise<number | null> {
    if (profile.observationTaxonId === null) {
      return null;
    }
    return this.observations.countByLocality(profile.pestType, localityId, since);
  }

  /**
   * Every verified report, grouped by (locality, pest) — the same key the counts use.
   *
   * A report with no locality is dropped rather than grouped under a blank key: 4.4.3 raises a
   * *subject*, a subject is a (locality, pest) pair, and a report bound to no locality belongs to
   * no subject that could be raised.
   */
  private async verifiedByPair(): Promise<Map<string, Report[]>> {
    const grouped = new Map<string, Report[]>();
    for (const report of await this.reports.findByStatus(ReportStatus.Verified)) {
      if (report.clusterId === null) {
        continue;
      }
      const key = pestReportKey(report.clusterId, report.pestType);
      const bucket = grouped.get(key);
      if (bucket === undefined) {
        grouped.set(key, [report]);
      } else {
        bucket.push(report);
      }
    }
    return grouped;
  }

  private static hasEvidence(counts: PestReportCounts | null, observed: number | null): boolean {
    if (counts !== null && (counts.verifiedOpen > 0 || counts.recent > 0)) {
      return true;
    }
    return observed !== null && observed > 0;
  }

  /**
   * The mapping from stored evidence to driver inputs.
   *
   * `undefined` and `0` are different answers here and the difference is the whole of 4.1.12.
   * Report-derived counts are genuinely zero when absent — 5.2.5 means we know how many verified
   * reports a locality has, and the answer can legitimately be none. The operator distance is
   * `undefined` when the registry did not load, because "we have no registry" is not "the nearest
   * operator is far away", and 4.1.9 redistributes the weight instead of inventing a number.
   */
  private inputsFor(
    profile: PestProfile,
    counts: PestReportCounts | null,
    observed: number | null,
    daysSinceTreatment: number,
    nearestOperatorM: number | null,
  ): DriverInputs {
    const inputs: DriverInputs = {
      verifiedOpenReports: counts?.verifiedOpen ?? 0,
      reportVelocity: counts?.recent ?? 0,
      corroborationDensity: counts?.corroborations ?? 0,
      // Per locality, not per pest. A cleaning crew treating a site treats the site, and the
      // treatment record does not name a pest — so this is the honest reading of what is stored.
      // Were treatments ever recorded per pest, this line is the one that would change.
      daysSinceLastTreatment: daysSinceTreatment,
    };
    if (observed !== null) {
      inputs.externalObservationDensity = observed;
    }
    if (nearestOperatorM !== null) {
      inputs.responseCapacityDeficit = nearestOperatorM;
    }
    // Tier A's five feed-derived drivers are deliberately absent: `profile.drivers()` does not
    // include them for tier B or C, so supplying them would be ignored at best and misleading in
    // the breakdown at worst.
    void profile;
    return inputs;
  }
}
