/**
 * D-Fence — the priority scoring engine.
 * Stereotype: <<control>>. Traces: 4.1.x, 7.2.x, 10.1.3, 10.6.2.
 *
 * The computational core, and the class the module's "data processing" criterion is judged on.
 * Designated Lab 4 subject for equivalence-class and boundary-value testing: the tier thresholds
 * give natural boundaries, and every driver has a defined range.
 *
 * Two design decisions live here. Normalisation is a Strategy per driver, because 4.1.4 obliges a
 * method per driver and named none — that was open item 1 out of Lab 2. Weights come from
 * ConfigSet, because 10.6.2 requires them outside the code.
 */
import { Driver, PriorityTier } from '../entity/enums';
import { Cluster } from '../entity/Cluster';
import { PriorityScore } from '../entity/PriorityScore';
import { DriverContribution } from '../entity/DriverContribution';
import { PriorityScoreRepository } from '../persistence/PriorityScoreRepository';
import { ConfigSet } from '../config/ConfigSet';
import { NormalisationStrategy } from './normalisation/NormalisationStrategy';
import { ClusterRanking } from './ClusterRanking';
import { DomainEvent, DomainEventSubscriber, EventKind } from './DomainEventPublisher';

export class PriorityScoringEngine implements DomainEventSubscriber {
  constructor(
    private readonly strategies: Map<Driver, NormalisationStrategy>,
    private readonly config: ConfigSet,
    private readonly scores: PriorityScoreRepository,
  ) {}

  // --- Observer: rescore when ingestion completes -------------------------------------------
  handles(): EventKind[] {
    return [EventKind.IngestionCompleted, EventKind.TreatmentRecorded];
  }

  async on(_event: DomainEvent): Promise<void> {
    // TODO(F5): rescore the clusters the event names, not all of them.
    throw new Error('not implemented');
  }

  // --- Scoring ------------------------------------------------------------------------------

  /**
   * Scores every cluster given and returns them ranked.
   * 10.1.3 bounds this at 60 seconds for 500 clusters, which is why the driver inputs are fetched
   * in bulk before the loop rather than per cluster inside it.
   */
  computeScores(_clusters: Cluster[]): Promise<ClusterRanking> {
    throw new Error('not implemented');
  }

  /**
   * One cluster's score: build the seven contributions, weight them, sum, assign a tier.
   * A driver whose input is unavailable is excluded and the score marked degraded (4.1.x) rather
   * than silently treated as zero — a missing rainfall feed must not read as a dry cluster.
   */
  scoreOne(_cluster: Cluster): PriorityScore {
    throw new Error('not implemented');
  }

  private buildBreakdown(_cluster: Cluster): DriverContribution[] {
    // TODO(F5): one contribution per driver, each recording raw, normalised, weight and product.
    // 4.1.10 requires the breakdown to be stored, not recomputed at display time.
    throw new Error('not implemented');
  }

  /**
   * Weighted sum of the contributions, expressed on 0-100.
   * 4.1.6 requires the weights to sum to 1.0. That is asserted at configuration load
   * (ConfigSet.validate), so by here the sum of the *present* weights is the share of the score
   * that was computable: a degraded score is renormalised over the drivers that survived rather
   * than quietly scoring low because a feed was down.
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
    return (weighted / weightPresent) * 100;
  }

  /**
   * Maps a score to a tier. The two thresholds are the Lab 4 boundary-value cases: a score exactly
   * on a threshold must land on one side deterministically, and this method is where that is decided.
   */
  assignTier(score: number): PriorityTier {
    // A score exactly on a threshold takes the HIGHER tier. Stated here because it is a decision,
    // not an accident of comparison operators: 70.0 is High and 40.0 is Medium, and the Lab 4
    // boundary-value cases are 39.9 / 40.0 / 40.1 and 69.9 / 70.0 / 70.1.
    if (score >= this.config.tierThresholds.high) {
      return PriorityTier.High;
    }
    if (score >= this.config.tierThresholds.medium) {
      return PriorityTier.Medium;
    }
    return PriorityTier.Low;
  }

  /**
   * @param available the drivers whose inputs were retrievable this cycle
   * @returns the drivers that were excluded, which PriorityScore records so the dashboard can say so
   *
   * A missing driver is excluded and the score marked degraded — never treated as zero. A rainfall
   * feed that is down must not read as a dry cluster (10.2.1, 10.2.2).
   */
  private degradeForMissingDrivers(available: Driver[]): Driver[] {
    return Object.values(Driver).filter((d) => !available.includes(d));
  }
}
