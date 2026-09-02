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

  add(_score: PriorityScore): void {
    throw new Error('not implemented');
  }

  /** Sorts descending by score and writes rank back onto each PriorityScore. */
  rank(): void {
    throw new Error('not implemented');
  }

  top(_n: number): PriorityScore[] {
    throw new Error('not implemented');
  }

  byTier(_tier: PriorityTier): PriorityScore[] {
    throw new Error('not implemented');
  }

  size(): number {
    return this.ordered.length;
  }
}
