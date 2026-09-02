/**
 * D-Fence — repository contract (Fox pp. 341-345, heuristics 6 and 7).
 * One repository per aggregate root; nothing outside the persistence package writes SQL.
 * Layer: ports — the interface. The implementations stay in persistence/.
 */
import { Uuid } from '../entity/valueTypes';

export interface Repository<T> {
  findById(id: Uuid): Promise<T | null>;
  save(entity: T): Promise<T>;
  delete(id: Uuid): Promise<void>;
}
