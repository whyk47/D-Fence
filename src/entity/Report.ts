/**
 * D-Fence — entity class `Report`
 * Stereotype: <<entity>>. Traces: 5.1.1–5.1.14, 5.2.1–5.2.9, 5.3.5.
 *
 * `status` is private for the same reason it is on `WorkOrder`: 5.2.1 defines a status set and
 * 5.2.3 says who may move it, and those are rules the type system can hold rather than a convention
 * a future contributor has to know about. Only `ReportLifecycleController` calls `applyStatus`.
 */

import { Uuid, GeoPoint } from './valueTypes';
import { ReportStatus, ReportType } from './enums';

/** 5.1.9 — a value of the locality binding, not a status. */
export const UNASSIGNED_LOCALITY = 'Unassigned';

export class Report {
  id!: Uuid;
  /** 5.1.10 */
  reporterId!: Uuid;
  point!: GeoPoint;
  type!: ReportType;
  description!: string;
  /** 5.1.7 — the active cluster containing the point, or null when none does. */
  clusterId!: Uuid | null;
  /** 5.1.8, 5.1.9 — the containing cluster's locality, the nearest within 1 km, or Unassigned. */
  localityBinding!: string;
  corroborationCount!: number;
  /** 5.1.10 */
  submittedAt!: Date;
  /** 5.3.4 */
  moderatorId!: Uuid | null;
  moderatedAt!: Date | null;
  moderationReason!: string | null;
  /** 8.1.2 — set when a work order is raised from this report; drives 5.2.6 and 5.2.7. */
  workOrderId!: Uuid | null;

  private status!: ReportStatus;

  currentStatus(): ReportStatus {
    return this.status;
  }

  /**
   * Called only by ReportLifecycleController, and only after the move has been checked against the
   * transition table. Nothing else in the system may call it.
   */
  applyStatus(next: ReportStatus): void {
    this.status = next;
  }

  /**
   * 5.1.11 — "an existing open report". Submitted, Verified and Actioned are all live: the site is
   * still reported and not yet cleared. Rejected and Closed are settled, so a new report at the same
   * spot is a new observation rather than a duplicate.
   */
  isOpen(): boolean {
    return (
      this.status === ReportStatus.Submitted ||
      this.status === ReportStatus.Verified ||
      this.status === ReportStatus.Actioned
    );
  }

  /**
   * 5.2.5 — only Verified and Actioned count toward the driver in 4.1.3. Submitted deliberately does
   * not: an unmoderated report reaching the score is the exact attack 5.3.1 exists to prevent, and
   * Closed does not either, because the site has been dealt with.
   */
  isVerified(): boolean {
    return this.status === ReportStatus.Verified || this.status === ReportStatus.Actioned;
  }

  /**
   * 5.2.9, 5.3.5 — the projection other Residents may see: no reporter id, and no photographs until
   * the report has been Verified. Built here rather than in the controller so that every caller
   * gets the same answer; a projection assembled per screen is a leak waiting for a new screen.
   */
  publicProjection(): {
    id: Uuid;
    type: ReportType;
    description: string;
    point: GeoPoint;
    localityBinding: string;
    status: ReportStatus;
    corroborationCount: number;
    submittedAt: Date;
    photosVisible: boolean;
  } {
    return {
      id: this.id,
      type: this.type,
      description: this.description,
      point: this.point,
      localityBinding: this.localityBinding,
      status: this.status,
      corroborationCount: this.corroborationCount,
      submittedAt: this.submittedAt,
      photosVisible: this.status !== ReportStatus.Submitted && this.status !== ReportStatus.Rejected,
    };
  }
}
