/**
 * D-Fence — the ordered priority list (Fox pp. 341-345, heuristic 6: container class).
 * Traces: 4.1.x, 7.2.x.
 *
 * A container rather than a bare array, because ranking is a responsibility: 4.1.x defines what
 * order means, and having one object own it stops three screens each sorting slightly differently.
 */
import { PriorityTier } from '../entity/enums';
import { PriorityScore } from '../entity/PriorityScore';

export class ClusterRanking {
  private readonly ordered: PriorityScore[] = [];

  add(score: PriorityScore): void {
    this.ordered.push(score);
  }

  /**
   * Sorts descending by score and writes rank back onto each PriorityScore, starting at 1.
   * Ties break on cluster id so the order is stable between runs — a table that reshuffles
   * equal-scoring clusters on every refresh looks broken to an Operations Manager.
   */
  rank(): void {
    this.ordered.sort((a, b) => b.score - a.score || a.clusterId.localeCompare(b.clusterId));
    this.ordered.forEach((s, i) => {
      s.rank = i + 1;
    });
  }

  top(n: number): PriorityScore[] {
    return this.ordered.slice(0, Math.max(0, n));
  }

  byTier(tier: PriorityTier): PriorityScore[] {
    return this.ordered.filter((s) => s.tier === tier);
  }

  size(): number {
    return this.ordered.length;
  }
}
