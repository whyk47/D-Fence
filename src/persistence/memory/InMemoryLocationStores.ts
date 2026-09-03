/**
 * D-Fence — in-memory saved locations and subscriptions.
 * Stereotype: <<persistence>>. Traces: 3.1.1, 3.1.8, 3.1.11, 3.1.12, 10.6.3.
 */
import { randomUUID } from 'node:crypto';
import { AlertSubscriptionStore, SavedLocationStore } from '../../ports/Stores';
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

/**
 * 3.1.12's half of the subscription store, and no more. E6 will implement the rest of §6 against
 * a wider interface; this exists so the cascade is real code today rather than a TODO that leaves
 * orphaned subscriptions firing at a location that no longer exists.
 */
export class InMemoryAlertSubscriptionStore implements AlertSubscriptionStore {
  private readonly byLocation = new Map<Uuid, Uuid[]>();

  /** Test and dev seam until E6 provides the real creation path. */
  add(locationId: Uuid, subscriptionId: Uuid = randomUUID()): void {
    this.byLocation.set(locationId, [...(this.byLocation.get(locationId) ?? []), subscriptionId]);
  }

  async deleteForLocation(locationId: Uuid): Promise<number> {
    const removed = this.byLocation.get(locationId)?.length ?? 0;
    this.byLocation.delete(locationId);
    return removed;
  }

  countFor(locationId: Uuid): number {
    return this.byLocation.get(locationId)?.length ?? 0;
  }
}
