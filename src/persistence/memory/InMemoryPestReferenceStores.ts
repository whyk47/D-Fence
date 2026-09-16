/**
 * D-Fence — in-memory stores for the two v0.9 reference sources.
 * Layer: persistence. Traces: 1.5.11, 1.6.5, 1.6.6, 1.6.7, 4.1.24, 10.6.3.
 *
 * Both are the fallback implementations used when no database is configured, and both are the
 * implementations every unit test runs against. That is the point of 10.6.3: the control layer is
 * tested against the port, not against Postgres.
 */
import { GeoPoint } from '../../entity/valueTypes';
import { PestType } from '../../entity/enums';
import { ObservationRecord } from '../../entity/ObservationRecord';
import { VectorControlOperator } from '../../entity/VectorControlOperator';
import { ObservationStore, OperatorRegistryStore } from '../../ports/Stores';

export class InMemoryOperatorRegistryStore implements OperatorRegistryStore {
  private operators: VectorControlOperator[] = [];
  private published: Date | null = null;
  /** 1.6.5. Survives `saveRegistry`, because a reload should cost nothing the second time. */
  private readonly coordinates = new Map<string, GeoPoint>();

  async saveRegistry(operators: VectorControlOperator[], publishedAt: Date | null): Promise<void> {
    // Replace wholesale rather than merge: the registry is a snapshot of a published file, and a
    // merge would keep operators that the publisher has since removed from it.
    this.operators = [...operators];
    this.published = publishedAt;
  }

  async registry(): Promise<VectorControlOperator[]> {
    return [...this.operators];
  }

  async publishedAt(): Promise<Date | null> {
    return this.published;
  }

  async cachedCoordinate(postalCode: string): Promise<GeoPoint | null> {
    return this.coordinates.get(postalCode) ?? null;
  }

  async cacheCoordinate(postalCode: string, point: GeoPoint): Promise<void> {
    this.coordinates.set(postalCode, point);
  }
}

export class InMemoryObservationStore implements ObservationStore {
  /** Keyed by the supplier's observation id — this map *is* requirement 1.5.11. */
  private readonly records = new Map<string, ObservationRecord>();

  async save(observations: ObservationRecord[]): Promise<number> {
    let written = 0;
    for (const observation of observations) {
      if (this.records.has(observation.observationId)) {
        continue;
      }
      this.records.set(observation.observationId, observation);
      written += 1;
    }
    return written;
  }

  async countByLocality(pestType: PestType, localityId: string, since: Date): Promise<number> {
    let count = 0;
    for (const record of this.records.values()) {
      if (
        record.pestType === pestType &&
        record.localityId === localityId &&
        record.observedOn.getTime() >= since.getTime()
      ) {
        count += 1;
      }
    }
    return count;
  }

  async all(): Promise<ObservationRecord[]> {
    return [...this.records.values()];
  }
}
