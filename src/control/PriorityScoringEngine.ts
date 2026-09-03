/**
 * D-Fence — the priority scoring engine.
 * Stereotype: <<control>>. Traces: 4.1.1–4.1.21, 7.2.x, 10.1.3, 10.6.2.
 *
 * The computational core, and the class the module's "data processing" criterion is judged on.
 * Designated Lab 4 subject for equivalence-class and boundary-value testing.
 *
 * Two design decisions live here. Normalisation is a Strategy per driver, because 4.1.4 obliges a
 * method per driver and named none — that was open item 1 out of Lab 2. Weights come from
 * ConfigSet, because 10.6.2 requires them outside the code.
 */
import { Driver, PriorityTier } from '../entity/enums';
import { Cluster } from '../entity/Cluster';
import { PriorityScore } from '../entity/PriorityScore';
import { DriverContribution } from '../entity/DriverContribution';
import { PriorityScoreStore } from '../ports/Stores';
import { ConfigSet } from '../config/ConfigSet';
import { NormalisationContext, NormalisationStrategy } from './normalisation/NormalisationStrategy';
import { ClusterRanking, RankingKey } from './ClusterRanking';
import { DomainEvent, DomainEventSubscriber, EventKind } from './DomainEventPublisher';

/**
 * The driver inputs a scoring cycle needs that do not live on Cluster — rainfall accumulations,
 * verified open report counts, treatment recency. They are fetched in bulk *before* the loop
 * (10.1.3 bounds a 500-cluster cycle at 60 seconds), which is why they arrive as a map rather than
 * being looked up per cluster inside `scoreOne`.
 */
export interface DriverInputs {
  rainfall24h?: number;
  rainfall72h?: number;
  verifiedOpenReports?: number;
  daysSinceLastTreatment?: number;
}

export class PriorityScoringEngine implements DomainEventSubscriber {
  constructor(
    private readonly strategies: Map<Driver, NormalisationStrategy>,
    private readonly config: ConfigSet,
    private readonly scores: PriorityScoreStore,
  ) {}

  /** Drivers whose source is stale this cycle. 4.1.12 excludes them; 4.1.20 names them. */
  private staleDrivers = new Set<Driver>();

  markStale(drivers: Driver[]): void {
    this.staleDrivers = new Set(drivers);
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
  async computeScores(
    clusters: Cluster[],
    inputs: Map<string, DriverInputs> = new Map(),
    now: Date = new Date(),
  ): Promise<ClusterRanking> {
    const ranking = new ClusterRanking();
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

    const scored: PriorityScore[] = [];
    for (const cluster of clusters) {
      const score = this.scoreOne(cluster, inputs.get(cluster.id) ?? {}, ctx);
      scored.push(score);
      const key: RankingKey = { caseSize: cluster.caseSize, locality: cluster.locality };
      ranking.add(score, key);
    }

    ranking.rank();
    await this.scores.saveAll(scored);
    return ranking;
  }

  /**
   * One cluster's score: build the contributions, weight them, sum, assign a tier.
   * A driver whose source is stale is excluded (4.1.12), the score is marked DEGRADED (4.1.13) and
   * every excluded driver is named alongside it (4.1.20) — never silently treated as zero, because
   * a missing rainfall feed must not read as a dry cluster.
   */
  scoreOne(cluster: Cluster, inputs: DriverInputs = {}, ctx?: NormalisationContext): PriorityScore {
    const context: NormalisationContext = ctx ?? {
      observedMin: 0,
      observedMax: cluster.caseSize,
      now: new Date(),
    };
    const breakdown = this.buildBreakdown(cluster, inputs, context);
    const present = breakdown.map((c) => c.driver);
    const excluded = this.degradeForMissingDrivers(present);

    const score = new PriorityScore();
    score.clusterId = cluster.id;
    score.computedAt = context.now;
    score.score = this.applyWeights(breakdown);
    score.tier = this.assignTier(score.score);
    score.excludedDrivers = excluded;
    score.isDegraded = excluded.length > 0;
    score.rank = 0;
    score.contributions = breakdown;
    return score;
  }

  /**
   * One contribution per available driver, each recording raw, normalised, weight and product.
   * 4.1.10 requires the breakdown to be **stored**, not recomputed at display time, which is also
   * what makes 4.1.18's "explain this score" answerable months later.
   *
   * A driver is omitted when its input is absent or its source is stale. Omission is not zero: an
   * omitted driver is excluded from the weighted sum and its weight is redistributed (4.1.19).
   */
  private buildBreakdown(
    cluster: Cluster,
    inputs: DriverInputs,
    ctx: NormalisationContext,
  ): DriverContribution[] {
    const raw = new Map<Driver, number | undefined>([
      [Driver.CaseSize, cluster.caseSize],
      [Driver.CaseGrowthDelta, cluster.caseDelta],
      [Driver.Rainfall24h, inputs.rainfall24h],
      [Driver.Rainfall72h, inputs.rainfall72h],
      [Driver.VerifiedOpenReportCount, inputs.verifiedOpenReports],
      [Driver.DaysSinceLastTreatment, inputs.daysSinceLastTreatment],
      [Driver.PremisesMix, cluster.premisesMix?.ratio()],
    ]);

    const contributions: DriverContribution[] = [];
    for (const [driver, value] of raw) {
      if (value === undefined || Number.isNaN(value) || this.staleDrivers.has(driver)) {
        continue;
      }
      const strategy = this.strategies.get(driver);
      const weight = this.config.driverWeights.get(driver);
      if (strategy === undefined || weight === undefined) {
        // Fails loudly rather than scoring without the driver: an unbound driver is a wiring
        // defect, and a silently smaller score is the hardest kind of bug to notice.
        throw new Error(`driver ${driver} has no ${strategy === undefined ? 'strategy' : 'weight'} (4.1.3)`);
      }
      const contribution = new DriverContribution();
      contribution.driver = driver;
      contribution.rawValue = value;
      contribution.normalisedValue = strategy.normalise(value, ctx);
      contribution.weight = weight;
      contribution.contribution = contribution.normalisedValue * weight;
      contributions.push(contribution);
    }
    return contributions;
  }

  /**
   * 4.1.7: the weighted sum of the normalised drivers, on a 0-100 scale to one decimal place.
   *
   * 4.1.6 requires the configured weights to sum to 1.0, asserted at load in ConfigSet.validate().
   * So the sum of the *present* weights here is the share of the score that was computable, and
   * dividing by it is 4.1.19 — renormalising the remaining weights to 1.0 after a driver is
   * excluded under 4.1.12. Without that division a stale rainfall feed would not merely remove a
   * driver, it would push every cluster's score down and reorder the whole dashboard.
   *
   * The rounding is part of the requirement, not presentation: 4.1.7 says one decimal place, and
   * rounding here rather than in the UI means the stored score and the displayed score are the
   * same number — which matters because 4.1.11 keeps the score as history and 4.1.17 compares
   * scores across cycles.
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
    return Math.round((weighted / weightPresent) * 1000) / 10;
  }

  /**
   * 4.1.8: High at 70.0 or above, Medium from 40.0 to 69.9, Low below 40.0. The thresholds
   * themselves come from configuration (4.1.9), not from constants here.
   *
   * 4.1.8 is written in a way that leaves no ambiguity at the boundary — "70.0 or above" — and this
   * method is where that reading is committed to. It is the Lab 4 boundary-value subject.
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
