/**
 * D-Fence — AccountRepository.
 * Stereotype: <<persistence>>. Traces: 2.1.x
 */
import { Repository } from '../ports/Repository';
import { Database } from './Database';
import { Account, Uuid, GeoPoint, SourceKind, WorkOrderStatus, ClusterSnapshot, SourceHealth } from '../entity';

export class AccountRepository implements Repository<Account> {
  constructor(private readonly db: Database) {}

  findById(id: Uuid): Promise<Account | null> {
    throw new Error('not implemented');
  }

  save(entity: Account): Promise<Account> {
    throw new Error('not implemented');
  }

  delete(id: Uuid): Promise<void> {
    throw new Error('not implemented');
  }

  findByEmail(email: string): Promise<Account | null> {
    // TODO
    throw new Error('not implemented');
  }

}
