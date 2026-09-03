/**
 * D-Fence — in-memory saved locations and subscriptions.
 * Stereotype: <<persistence>>. Traces: 3.1.1, 3.1.8, 3.1.11, 3.1.12, 10.6.3.
 */
import { randomUUID } from 'node:crypto';
import { SavedLocationStore } from '../../ports/Stores';
import { Uuid } from '../../entity/valueTypes';
import { SavedLocation } from '../../entity/SavedLocation';

export class InMemorySavedLocationStore implements SavedLocationStore {
  private readonly locations = new Map<Uuid, SavedLocation>();

  async findById(id: Uuid): Promise<SavedLocation | null> {
    return this.locations.get(id) ?? null;
  }

  async findForAccount(accountId: Uuid): Promise<SavedLocation[]> {
    return [...this.locations.values()].filter((l) => l.accountId === accountId);
  }

  async save(location: SavedLocation): Promise<SavedLocation> {
    location.id = location.id || randomUUID();
    this.locations.set(location.id, location);
    return location;
  }

  async delete(id: Uuid): Promise<void> {
    this.locations.delete(id);
  }

  async all(): Promise<SavedLocation[]> {
    return [...this.locations.values()];
  }
}

// `InMemoryAlertSubscriptionStore` lived here while 3.1.12 was the only thing that needed it.
// It moved to `InMemoryAlertStores.ts` with E6, next to the rest of §6 — re-exported so the
// import path that existed first still works.
export { InMemoryAlertSubscriptionStore } from './InMemoryAlertStores';
