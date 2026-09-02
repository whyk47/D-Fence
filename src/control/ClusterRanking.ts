/**
 * D-Fence — the ordered priority list (Fox pp. 341-345, heuristic 6: container class).
 * Traces: 4.1.14, 7.2.x.
 *
 * A container rather than a bare array, because ranking is a responsibility: 4.1.14 defines exactly
 * what order means — descending score, ties broken by case size and then by locality name — and
 * having one object own it stops three screens each sorting slightly differently.
 */
import { PriorityTier } from '../entity/enums';
import { Uuid } from '../entity/valueTypes';
import { PriorityScore } from '../entity/PriorityScore';

/**
 * The two tie-break fields 4.1.14 names. They live on Cluster, not on PriorityScore, so the engine
 * supplies them alongside each score rather than the ranking reaching back into the repository.
 */
export interface RankingKey {
  caseSize: number;
  locality: string;
}

export class ClusterRanking {
  private readonly ordered: PriorityScore[] = [];
  private readonly keys = new Map<Uuid, RankingKey>();

  add(score: PriorityScore, key: RankingKey): void {
    this.ordered.push(score);
    this.keys.set(score.clusterId, key);
  }

  /**
   * 4.1.14: descending score, then descending case size, then locality name ascending.
   * The third key makes the order total, so the table does not reshuffle equal-scoring clusters
   * between refreshes — which looks like a bug to an Operations Manager watching the dashboard.
   * Writes rank back onto each PriorityScore, starting at 1.
   */
  rank(): void {
    this.ordered.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const ka = this.keys.get(a.clusterId);
      const kb = this.keys.get(b.clusterId);
      if (!ka || !kb) {
        // A score with no ranking key cannot be ordered by 4.1.14. Failing loudly beats emitting a
        // ranking that silently disagrees with the requirement.
        throw new Error(`no ranking key for cluster ${!ka ? a.clusterId : b.clusterId} (4.1.14)`);
      }
      if (kb.caseSize !== ka.caseSize) {
        return kb.caseSize - ka.caseSize;
      }
      return ka.locality.localeCompare(kb.locality);
    });
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
