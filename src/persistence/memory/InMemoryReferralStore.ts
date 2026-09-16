/**
 * D-Fence — in-memory `ReferralStore`.
 * Traces: 8.6.1, 8.6.4, 8.6.7, 8.6.8, 10.6.3.
 *
 * The same shape as every other in-memory store here: enough to run the control layer in a unit test
 * with no database, and deliberately no cleverer than the Postgres one it stands in for.
 */
import { Uuid } from '../../entity/valueTypes';
import { Referral } from '../../entity/Referral';
import { ReferralStore } from '../../ports/Stores';

export class InMemoryReferralStore implements ReferralStore {
  private readonly byId = new Map<Uuid, Referral>();

  async save(referral: Referral): Promise<Referral> {
    this.byId.set(referral.id, referral);
    return referral;
  }

  async findById(id: Uuid): Promise<Referral | null> {
    return this.byId.get(id) ?? null;
  }

  async findByReport(reportId: Uuid): Promise<Referral | null> {
    return [...this.byId.values()].find((r) => r.reportId === reportId) ?? null;
  }

  /** 8.6.7 — open means referred and not yet answered. A closed referral is history. */
  async findOpen(): Promise<Referral[]> {
    return [...this.byId.values()]
      .filter((r) => !r.isClosed())
      .sort((a, b) => a.referredAt.getTime() - b.referredAt.getTime());
  }

  size(): number {
    return this.byId.size;
  }
}
