/**
 * D-Fence — entity class `SavedLocation`
 * Stereotype: <<entity>>. Traces: 3.1.1–3.1.12.
 */

import { Uuid, GeoPoint } from './valueTypes';
import { ExposureStatus, LocationLabel } from './enums';

/** 3.1.1 */
export const MAX_SAVED_LOCATIONS = 5;
/** 3.1.7 */
export const MAX_LOCATION_NAME_CHARS = 40;
/**
 * 3.1.9. The band that separates WITHIN_150M from CLEAR, and a judgement — it is in the
 * assumptions table of `REQUIREMENTS.md` §13 for exactly that reason.
 */
export const NEAR_CLUSTER_METRES = 150;

/** 3.1.10 — everything the location card shows about the cluster it is near. */
export interface ExposureDetail {
  clusterId: Uuid | null;
  clusterLocality: string | null;
  caseSize: number | null;
  distanceMetres: number | null;
  /** The data timestamp, not the evaluation time: 3.1.10 asks how fresh the *feed* is. */
  dataTimestamp: Date | null;
}

export class SavedLocation {
  id!: Uuid;
  accountId!: Uuid;
  /** What the resident typed. Kept so the card can say what they asked for, not just where it landed. */
  inputText!: string;
  /** The confirmed address from geocoding (3.1.4), which is what they actually chose. */
  resolvedAddress!: string;
  point!: GeoPoint;
  label!: LocationLabel;
  name!: string;
  exposureStatus!: ExposureStatus;
  exposure!: ExposureDetail;
  rain24hMm!: number | null;
  rain72hMm!: number | null;
  evaluatedAt!: Date | null;

  /** True when the status is IN_CLUSTER or WITHIN_150M (3.1.8, 6.1.2). */
  isExposed(): boolean {
    return this.exposureStatus === ExposureStatus.IN_CLUSTER || this.exposureStatus === ExposureStatus.WITHIN_150M;
  }

  /**
   * 3.1.9 — the status implied by a distance to the nearest cluster boundary.
   *
   * A pure function of one number, deliberately: it is the only place the three statuses are
   * decided, so a screen, a scheduled job and an alert evaluator cannot each round the boundary
   * differently. The 150 m comparison is **inclusive** — a location exactly 150 m from a cluster
   * is near it, the same reading given to 5.1.11's radius.
   */
  static statusFor(distanceMetres: number | null): ExposureStatus {
    if (distanceMetres === null) {
      return ExposureStatus.CLEAR;
    }
    if (distanceMetres <= 0) {
      return ExposureStatus.IN_CLUSTER;
    }
    return distanceMetres <= NEAR_CLUSTER_METRES ? ExposureStatus.WITHIN_150M : ExposureStatus.CLEAR;
  }

  /** What the resident's location card reads (3.1.10). */
  card(): {
    id: Uuid;
    name: string;
    label: LocationLabel;
    address: string;
    status: ExposureStatus;
    cluster: string | null;
    caseSize: number | null;
    distanceMetres: number | null;
    dataTimestamp: Date | null;
    evaluatedAt: Date | null;
  } {
    return {
      id: this.id,
      name: this.name,
      label: this.label,
      address: this.resolvedAddress,
      status: this.exposureStatus,
      cluster: this.exposure?.clusterLocality ?? null,
      caseSize: this.exposure?.caseSize ?? null,
      distanceMetres: this.exposure?.distanceMetres ?? null,
      dataTimestamp: this.exposure?.dataTimestamp ?? null,
      // Stated separately from the data timestamp: "we checked at 10:05 against a feed published
      // yesterday" is two facts, and a card showing only one of them is misleading either way.
      evaluatedAt: this.evaluatedAt,
    };
  }
}
