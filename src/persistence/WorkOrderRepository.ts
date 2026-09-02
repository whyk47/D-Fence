/**
 * D-Fence — WorkOrderRepository.
 * Stereotype: <<persistence>>. Traces: 8.1.x, 8.3.x, 7.5.5
 */
import { Repository } from '../ports/Repository';
import { Database } from './Database';
import { WorkOrder, Uuid, GeoPoint, SourceKind, WorkOrderStatus, ClusterSnapshot, SourceHealth } from '../entity';

export class WorkOrderRepository implements Repository<WorkOrder> {
  constructor(private readonly db: Database) {}

  findById(id: Uuid): Promise<WorkOrder | null> {
    throw new Error('not implemented');
  }

  save(entity: WorkOrder): Promise<WorkOrder> {
    throw new Error('not implemented');
  }

  delete(id: Uuid): Promise<void> {
    throw new Error('not implemented');
  }

  /** 2.3.5: a Crew Member reads only their own. */
  findByAssignee(accountId: Uuid): Promise<WorkOrder[]> {
    // TODO
    throw new Error('not implemented');
  }

  findByCluster(id: Uuid): Promise<WorkOrder[]> {
    // TODO
    throw new Error('not implemented');
  }

  /** 7.5.5: the dashboard must show these. */
  findIssueFlagged(): Promise<WorkOrder[]> {
    // TODO
    throw new Error('not implemented');
  }

  /** Called only from WorkOrderLifecycleController, after validation. */
  updateStatus(id: Uuid, next: WorkOrderStatus): Promise<WorkOrder> {
    // TODO
    throw new Error('not implemented');
  }

}
