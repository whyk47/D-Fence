/**
 * D-Fence — PriorityScoreRepository.
 * Stereotype: <<persistence>>. Traces: 4.1.10, 4.1.11, 4.1.12, 4.1.14, 7.2.1, 7.2.6.
 *
 * Scores are **history, not a current value**. 4.1.11 keeps every cycle's result and 7.2.1 forbids
 * the dashboard recomputing for display, so this table is append-only in practice: `latest()` is
 * "the most recent computed_at", never "the row we overwrote".
 *
 * The breakdown is stored rather than recomputed (4.1.10). A dashboard that recomputed a
 * contribution would show a number that never existed in the history, and the two would drift the
 * first time a weight changed.
 */
import { randomUUID } from 'node:crypto';
import { Database, Row } from './Database';
import { PriorityScore } from '../entity/PriorityScore';
import { DriverContribution } from '../entity/DriverContribution';
import { Driver, PriorityTier } from '../entity/enums';
import { Uuid } from '../entity/valueTypes';
import { PriorityScoreStore } from '../ports/Stores';

export class PriorityScoreRepository implements PriorityScoreStore {
  constructor(private readonly db: Database) {}

  /**
   * One transaction for the whole cycle. A partially written cycle would give 4.1.14 a ranking with
   * holes in it — rank 1, 2, then 7 — and the dashboard would present it as complete.
   */
  async saveAll(scores: PriorityScore[]): Promise<void> {
    if (scores.length === 0) {
      return;
    }
    await this.db.transaction(async (tx) => {
      for (const score of scores) {
        const id = score.id || randomUUID();
        await tx.query(
          `INSERT INTO priority_score (id, cluster_id, computed_at, score, tier, is_degraded, excluded_drivers, rank)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (cluster_id, computed_at) DO UPDATE SET
             score = EXCLUDED.score, tier = EXCLUDED.tier, is_degraded = EXCLUDED.is_degraded,
             excluded_drivers = EXCLUDED.excluded_drivers, rank = EXCLUDED.rank`,
          [
            id,
            score.clusterId,
            score.computedAt,
            score.score,
            score.tier,
            score.isDegraded,
            score.excludedDrivers,
            score.rank,
          ],
        );
        score.id = id;
        // Rewritten wholesale rather than merged: a degraded cycle has FEWER contributions than a
        // healthy one, and merging would leave yesterday's rainfall contribution attached to a
        // score that explicitly excluded it (4.1.12).
        await tx.query(`DELETE FROM driver_contribution WHERE priority_score_id = $1`, [id]);
        for (const c of score.contributions) {
          await tx.query(
            `INSERT INTO driver_contribution (priority_score_id, driver, raw_value, normalised_value, weight, contribution)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, c.driver, c.rawValue, c.normalisedValue, c.weight, c.contribution],
          );
        }
      }
    });
  }

  /** 4.1.11 — the score history for one cluster, newest first. */
  async historyFor(clusterId: Uuid, limit: number): Promise<PriorityScore[]> {
    const rows = await this.db.query(
      `SELECT * FROM priority_score WHERE cluster_id = $1 ORDER BY computed_at DESC LIMIT $2`,
      [clusterId, limit],
    );
    return this.withContributions(rows);
  }

  /**
   * 7.2.1 — the most recent completed cycle, ranked.
   *
   * Scoped to a single `computed_at` rather than "the newest row per cluster": mixing two cycles
   * would produce a table whose ranks come from different runs, which is a ranking of nothing.
   */
  async latest(): Promise<PriorityScore[]> {
    const rows = await this.db.query(
      `SELECT * FROM priority_score
        WHERE computed_at = (SELECT max(computed_at) FROM priority_score)
        ORDER BY rank`,
    );
    return this.withContributions(rows);
  }

  private async withContributions(rows: Row[]): Promise<PriorityScore[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((r) => String(r.id));
    const contributions = await this.db.query(
      `SELECT * FROM driver_contribution WHERE priority_score_id = ANY($1)`,
      [ids],
    );
    const byScore = new Map<string, DriverContribution[]>();
    for (const row of contributions) {
      const key = String(row.priority_score_id);
      const contribution = new DriverContribution();
      contribution.driver = row.driver as Driver;
      contribution.rawValue = Number(row.raw_value);
      contribution.normalisedValue = Number(row.normalised_value);
      contribution.weight = Number(row.weight);
      contribution.contribution = Number(row.contribution);
      byScore.set(key, [...(byScore.get(key) ?? []), contribution]);
    }
    return rows.map((row) => {
      const score = new PriorityScore();
      score.id = String(row.id);
      score.clusterId = String(row.cluster_id);
      score.computedAt = row.computed_at as Date;
      score.score = Number(row.score);
      score.tier = row.tier as PriorityTier;
      score.isDegraded = Boolean(row.is_degraded);
      score.excludedDrivers = ((row.excluded_drivers as string[]) ?? []) as Driver[];
      score.rank = Number(row.rank);
      score.contributions = byScore.get(score.id) ?? [];
      return score;
    });
  }
}
