/**
 * D-Fence — in-memory work-order persistence.
 * Stereotype: <<persistence>>. Traces: 8.1.11, 8.2.7, 8.3.x, 8.4.1, 10.6.3.
 *
 * Same argument as `InMemoryStores.ts`: the lifecycle has to be runnable and testable before
 * Supabase exists. Kept in a separate file because the work-order aggregate is the largest one and
 * putting six more classes in the first file would make it the place everything lands.
 */
import { randomUUID } from 'node:crypto';
import { Notifier, TreatmentRecordStore, WorkOrderStore } from '../../ports/Stores';
import { Uuid } from '../../entity/valueTypes';
import { WorkOrderStatus } from '../../entity/enums';
import { WorkOrder } from '../../entity/WorkOrder';
import { CompletionEvidence } from '../../entity/CompletionEvidence';
import { TreatmentRecord } from '../../entity/TreatmentRecord';

export class InMemoryWorkOrderStore implements WorkOrderStore {
  private readonly orders = new Map<Uuid, WorkOrder>();
  private readonly history = new Map<Uuid, Array<{ assigneeId: Uuid | null; at: Date }>>();
  private readonly evidence = new Map<Uuid, CompletionEvidence[]>();

  async findById(id: Uuid): Promise<WorkOrder | null> {
    return this.orders.get(id) ?? null;
  }

  async save(workOrder: WorkOrder): Promise<WorkOrder> {
    workOrder.id = workOrder.id || randomUUID();
    this.orders.set(workOrder.id, workOrder);
    return workOrder;
  }

  /**
   * 8.1.11 — "open" is every status except the two terminal ones. Rejected counts as open, because
   * 8.3.19 says a rejected completion is work still outstanding; treating it as closed would let a
   * second work order be created for a job the crew is about to resume.
   */
  /** 7.3.4 — verified inside the window, oldest first. A work order verified before the
   *  window opened is not part of this month's turnaround, however long it took. */
  async findVerifiedSince(since: Date): Promise<WorkOrder[]> {
    return [...this.orders.values()]
      .filter((w) => w.verifiedAt !== null && w.verifiedAt.getTime() >= since.getTime())
      .sort((a, b) => (a.verifiedAt as Date).getTime() - (b.verifiedAt as Date).getTime());
  }

  async findOpenForCluster(clusterId: Uuid): Promise<WorkOrder[]> {
    return [...this.orders.values()].filter((w) => w.clusterId === clusterId && !w.isTerminal());
  }

  async findForAssignee(assigneeId: Uuid): Promise<WorkOrder[]> {
    return [...this.orders.values()].filter((w) => w.assigneeId === assigneeId);
  }

  async findAllOpen(): Promise<WorkOrder[]> {
    return [...this.orders.values()].filter((w) => !w.isTerminal());
  }

  async appendAssignmentHistory(workOrderId: Uuid, assigneeId: Uuid | null, at: Date): Promise<void> {
    const list = this.history.get(workOrderId) ?? [];
    list.push({ assigneeId, at });
    this.history.set(workOrderId, list);
  }

  async assignmentHistory(workOrderId: Uuid): Promise<Array<{ assigneeId: Uuid | null; at: Date }>> {
    return [...(this.history.get(workOrderId) ?? [])];
  }

  /** Append-only: a work order may be completed, rejected and re-completed, and 8.3.10's reason
   *  belongs to the attempt it refers to rather than to the work order. */
  async saveEvidence(evidence: CompletionEvidence): Promise<void> {
    evidence.id = evidence.id || randomUUID();
    const list = this.evidence.get(evidence.workOrderId) ?? [];
    list.push(evidence);
    this.evidence.set(evidence.workOrderId, list);
  }

  async latestEvidence(workOrderId: Uuid): Promise<CompletionEvidence | null> {
    const list = this.evidence.get(workOrderId) ?? [];
    return list.length === 0 ? null : (list[list.length - 1] as CompletionEvidence);
  }

  /** Test and dev convenience; not part of the port. */
  all(): WorkOrder[] {
    return [...this.orders.values()];
  }

  countOpenFor(assigneeId: Uuid): number {
    return [...this.orders.values()].filter(
      (w) => w.assigneeId === assigneeId && !w.isTerminal() && w.currentStatus() !== WorkOrderStatus.Completed,
    ).length;
  }
}

export class InMemoryTreatmentRecordStore implements TreatmentRecordStore {
  private readonly records: TreatmentRecord[] = [];

  async save(record: TreatmentRecord): Promise<TreatmentRecord> {
    record.id = record.id || randomUUID();
    this.records.push(record);
    return record;
  }

  async latestForCluster(clusterId: Uuid): Promise<TreatmentRecord | null> {
    const forCluster = await this.allForCluster(clusterId);
    return forCluster.length === 0 ? null : (forCluster[forCluster.length - 1] as TreatmentRecord);
  }

  async allForCluster(clusterId: Uuid): Promise<TreatmentRecord[]> {
    return this.records
      .filter((r) => r.clusterId === clusterId)
      .sort((a, b) => a.completionDate.localeCompare(b.completionDate));
  }

  /**
   * 4.1.15, 4.1.16 — days since the most recent verified treatment, or the 90-day default when
   * there has never been one. This is the join between §8 and the scoring engine: until a work
   * order is verified, every cluster enters the treatment driver saturated.
   */
  async daysSinceLastTreatment(clusterId: Uuid, now: Date): Promise<number> {
    const latest = await this.latestForCluster(clusterId);
    if (latest === null) {
      return 90;
    }
    const days = (now.getTime() - new Date(`${latest.completionDate}T00:00:00+08:00`).getTime()) / 86_400_000;
    return Math.max(0, Math.floor(days));
  }
}

/** Records notifications instead of sending them, so 8.2.4 and 8.3.11 are testable without a bot. */
export class RecordingNotifier implements Notifier {
  readonly sent: Array<{ accountId: Uuid; message: string; at: Date }> = [];

  async notify(accountId: Uuid, message: string): Promise<void> {
    this.sent.push({ accountId, message, at: new Date() });
  }

  to(accountId: Uuid): string[] {
    return this.sent.filter((s) => s.accountId === accountId).map((s) => s.message);
  }
}
