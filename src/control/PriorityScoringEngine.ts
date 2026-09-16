/**
 * D-Fence — the dengue scoring cycle.
 * Stereotype: <<control>>. Traces: 4.1.1–4.1.21, 4.2.4, 4.2.5, 7.2.x, 10.1.3, 10.6.2.
 *
 * **What this class is, after v0.9.** The computation moved out: urgency is `UrgencyCalculator` and
 * severity is `PestPriorityCalculator`, per `lab3/class-diagram-design-control.puml`. What is left
 * here is the *mosquito* cycle — turning clusters into scored subjects, assembling their driver
 * inputs, ranking and persisting. It is the tier A caller of the general scorer, not a scorer.
 *
 * It keeps its name and its public shape deliberately. 4.2.5 says the mosquito score shall equal its
 * v0.8 value, and the cheapest way to be sure of that is to leave every existing caller and every
 * existing test pointing at the same class and watch them stay green.
 *
 * `assignTier` and `scoreOne` remain here as delegations because they are the Lab 4 §3.2.1 subject
 * and the test plan's case ids refer to them.
 */
import { Driver, PestType, PriorityTier } from '../entity/enums';
import { Cluster } from '../entity/Cluster';
import { PriorityScore } from '../entity/PriorityScore';
import { PestProfile } from '../entity/PestProfile';
import { PriorityScoreStore } from '../ports/Stores';
import { ConfigSet } from '../config/ConfigSet';
import { NormalisationContext, NormalisationStrategy } from './normalisation/NormalisationStrategy';
import { PriorityRanking, RankingKey } from './PriorityRanking';
import { DomainEvent, DomainEventSubscriber, EventKind } from './DomainEventPublisher';
import { DriverInputs, UrgencyCalculator } from './scoring/UrgencyCalculator';
import { PestPriorityCalculator, ScoredSubject } from './scoring/PestPriorityCalculator';

export type { DriverInputs } from './scoring/UrgencyCalculator';

export class PriorityScoringEngine implements DomainEventSubscriber {
  private readonly urgencies: UrgencyCalculator;
  private readonly calculator: PestPriorityCalculator;

  /**
   * The shared calculator, for scorers of other pests.
   *
   * Exposed rather than constructed a second time so that every pest is scored by one object
   * holding one set of normalisation strategies and one set of tier thresholds. Two instances
   * would drift the moment configuration was reloaded into one of them, and the symptom would be
   * a rat and a mosquito in the same queue judged against different thresholds.
   */
  sharedCalculator(): PestPriorityCalculator {
    return this.calculator;
  }

  constructor(
    strategies: Map<Driver, NormalisationStrategy>,
    private readonly config: ConfigSet,
    private readonly scores: PriorityScoreStore,
  ) {
    this.urgencies = new UrgencyCalculator(strategies);
    this.calculator = new PestPriorityCalculator(this.urgencies, config.tierThresholds);
  }

  /** Drivers whose source is stale this cycle. 4.1.12 excludes them; 4.1.20 names them. */
  markStale(drivers: Driver[]): void {
    this.urgencies.markStale(drivers);
  }

  /**
   * The mosquito's profile: tier A, severity 1.000, the v0.8 weights.
   *
   * Read from configuration when a catalogue is loaded (4.2.2). The fallback exists so that a unit
   * test constructing a bare `ConfigSet` — as the Lab 4 §2 cases do — scores exactly as v0.8 did,
   * which is 4.2.5 holding in the tests as well as in the running system.
   */
  private mosquito(): PestProfile {
    return this.config.pestProfile(PestType.Mosquito);
  }

  // --- Observer: rescore when ingestion completes -------------------------------------------
  handles(): EventKind[] {
    return [EventKind.IngestionCompleted, EventKind.TreatmentRecorded];
  }

  async on(_event: DomainEvent): Promise<void> {
    // TODO(F5): rescore only the clusters the event names, not all of them. Correct today because
    // twelve clusters is not a performance problem; revisit if the feed ever grows.
    throw new Error('not implemented');
  }

  // --- Scoring ------------------------------------------------------------------------------

  /**
   * Scores every cluster given and returns them ranked (4.1.1, 4.1.14).
   * @param inputs driver values that do not live on Cluster, keyed by cluster id. A cluster with
   *   no entry is scored on what is available and marked DEGRADED, never scored as if the missing
   *   values were zero (4.1.12, 4.1.13).
   */
  /**
   * @param additional scores for other pests, computed elsewhere (`CrossPestScoringService`).
   *   They are ranked and saved *with* the mosquito scores rather than after them, because 4.1.14
   *   orders one queue: ranking the mosquito alone and appending the rest would give every
   *   mosquito a rank derived from a list it is not actually in, and 4.4.4's Critical-first rule
   *   could not lift a snake above a dengue cluster at all.
   */
  async computeScores(
    clusters: Cluster[],
    inputs: Map<string, DriverInputs> = new Map(),
    now: Date = new Date(),
    additional: Array<{ score: PriorityScore; locality: string }> = [],
  ): Promise<PriorityRanking> {
    const ranking = new PriorityRanking();
    if (clusters.length === 0) {
      return ranking;
    }

    const caseSizes = clusters.map((c) => c.caseSize);
    const deltas = clusters.map((c) => c.caseDelta ?? 0);
    const ctx: NormalisationContext = {
      observedMin: Math.min(...caseSizes),
      observedMax: Math.max(...caseSizes, ...deltas),
      now,
    };

    const profile = this.mosquito();
    const scored: PriorityScore[] = [];
    for (const cluster of clusters) {
      const given = inputs.get(cluster.id) ?? {};
      const score = this.scoreOne(cluster, given, ctx);
      scored.push(score);
      const key: RankingKey = {
        severityMultiplier: profile.severityMultiplier,
        verifiedOpenReportCount: given.verifiedOpenReports ?? 0,
        locality: cluster.locality,
      };
      ranking.add(score, key);
    }

    for (const { score, locality } of additional) {
      scored.push(score);
      ranking.add(score, PriorityRanking.keyFor(score, locality));
    }

    ranking.rank();
    await this.scores.saveAll(scored);
    return ranking;
  }

  /**
   * One cluster's score. The cluster's own fields — case size, growth, premises mix — are folded
   * into the driver inputs here, because from the general scorer's point of view a cluster is just
   * one more source of driver values.
   */
  scoreOne(cluster: Cluster, inputs: DriverInputs = {}, ctx?: NormalisationContext): PriorityScore {
    const context: NormalisationContext = ctx ?? {
      observedMin: 0,
      observedMax: cluster.caseSize,
      now: new Date(),
    };
    const subject: ScoredSubject = {
      localityId: cluster.id,
      locality: cluster.locality,
      pestType: PestType.Mosquito,
      clusterId: cluster.id,
    };
    const all: DriverInputs = {
      ...inputs,
      caseSize: cluster.caseSize,
      caseGrowthDelta: cluster.caseDelta,
      premisesMix: cluster.premisesMix?.ratio(),
    };
    return this.calculator.score(subject, this.mosquito(), all, context);
  }

  /** 4.1.8 — the Lab 4 boundary-value subject. Delegated; the decision lives in one place now. */
  assignTier(score: number): PriorityTier {
    return this.calculator.assignTier(score);
  }
}
