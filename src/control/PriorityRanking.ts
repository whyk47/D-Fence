/**
 * D-Fence — the ordered priority list (Fox pp. 341-345, heuristic 6: container class).
 * Stereotype: <<control>>. Traces: 4.1.14, 4.4.4, 7.2.13, 7.2.x.
 *
 * A container rather than a bare array, because ranking is a responsibility: 4.1.14 defines exactly
 * what order means and having one object own it stops three screens each sorting slightly
 * differently.
 *
 * **Renamed from `ClusterRanking` in v0.9**, because a ranking now mixes pests: 7.2.13 puts every
 * pest type in one queue by default and a per-pest view is a filter applied to it. The tie-break
 * changed with the name — v0.8 broke ties on case size, which exists for the mosquito alone and
 * cannot order a queue containing a rat and a snake.
 */
import { Driver, PriorityTier } from '../entity/enums';
import { Uuid } from '../entity/valueTypes';
import { PriorityScore } from '../entity/PriorityScore';

/**
 * The tie-break fields 4.1.14 names, in order. They live on the scored subject and its pest
 * profile, not on PriorityScore, so the calculator supplies them alongside each score rather than
 * the ranking reaching back into a repository.
 */
export interface RankingKey {
  /** 4.1.14 first tie-break: a more severe pest outranks a less severe one at equal score. */
  severityMultiplier: number;
  /** 4.1.14 second tie-break: real complaints outrank a score that came from elsewhere. */
  verifiedOpenReportCount: number;
  /** 4.1.14 third tie-break, and what makes the order total. */
  locality: string;
}

export class PriorityRanking {
  private readonly ordered: PriorityScore[] = [];
  private readonly keys = new Map<Uuid, RankingKey>();

  /**
   * 4.1.14's tie-breakers read off the score itself.
   *
   * The mosquito cycle passes its key explicitly because it has the driver inputs to hand; every
   * other pest is scored somewhere that does not, so the key is derived from the breakdown the
   * score already carries. Both produce the same numbers — `rawValue` for
   * `VerifiedOpenReportCount` *is* the count that was fed in — and having one derivation means a
   * pest cannot be ranked by a rule the mosquito is not ranked by.
   */
  static keyFor(score: PriorityScore, locality: string): RankingKey {
    const reports = score.contributions.find((c) => c.driver === Driver.VerifiedOpenReportCount);
    return {
      severityMultiplier: score.severityMultiplier,
      verifiedOpenReportCount: reports?.rawValue ?? 0,
      locality,
    };
  }

  add(score: PriorityScore, key: RankingKey): void {
    this.ordered.push(score);
    this.keys.set(this.identify(score), key);
  }

  /**
   * A score is identified by its subject — locality and pest — because one locality now carries up
   * to 22 scores. Keying on cluster id alone, as v0.8 did, would have the rat overwrite the mosquito.
   */
  private identify(score: PriorityScore): string {
    return `${score.localityId ?? score.clusterId}::${score.pestType ?? 'Mosquito'}`;
  }

  /**
   * 4.4.4 then 4.1.14: every Critical above every other tier, then descending score, then severity
   * multiplier, then verified open report count, then locality name ascending.
   *
   * The last key makes the order total, so the table does not reshuffle equal-scoring rows between
   * refreshes — which looks like a bug to an Operations Manager watching the dashboard.
   * Writes rank back onto each PriorityScore, starting at 1.
   */
  rank(): void {
    this.ordered.sort((a, b) => {
      // 4.4.4 — Critical is not a high score, it is a different question, and it is asked first.
      const ca = a.tier === PriorityTier.Critical ? 1 : 0;
      const cb = b.tier === PriorityTier.Critical ? 1 : 0;
      if (ca !== cb) {
        return cb - ca;
      }
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const ka = this.keys.get(this.identify(a));
      const kb = this.keys.get(this.identify(b));
      if (!ka || !kb) {
        // A score with no ranking key cannot be ordered by 4.1.14. Failing loudly beats emitting a
        // ranking that silently disagrees with the requirement.
        throw new Error(`no ranking key for ${this.identify(!ka ? a : b)} (4.1.14)`);
      }
      if (kb.severityMultiplier !== ka.severityMultiplier) {
        return kb.severityMultiplier - ka.severityMultiplier;
      }
      if (kb.verifiedOpenReportCount !== ka.verifiedOpenReportCount) {
        return kb.verifiedOpenReportCount - ka.verifiedOpenReportCount;
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

  /** 7.2.11 — the per-pest view, which 7.2.13 makes a filter over the one ranking, not a separate one. */
  byPest(pestType: PriorityScore['pestType']): PriorityScore[] {
    return this.ordered.filter((s) => s.pestType === pestType);
  }

  size(): number {
    return this.ordered.length;
  }
}
