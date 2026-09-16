/**
 * D-Fence — entity class `Referral`
 * Stereotype: <<entity>>. Traces: 8.6.1, 8.6.2, 8.6.4, 8.6.5, 8.6.8, 8.6.9, 8.6.10, 8.6.11
 *
 * Written when the system routes a case to an authority outside its own dispatch chain.
 *
 * This is the entity that makes widening the product to wildlife honest rather than cosmetic. A
 * D-Fence Cleaning Crew is not equipped or authorised to remove a snake, and the alternative to
 * saying so is a work order nobody can carry out. A referral records that the case left the system,
 * who it went to, and what came of it.
 *
 * **It is not a treatment.** 8.6.10 and 8.6.11 forbid a work order and a treatment record, and they
 * are not tidiness: `DaysSinceLastTreatment` is the driver that lets a score fall after work is done
 * (4.1.17), and telling it a locality was treated when nobody treated it corrupts the one feedback
 * loop the whole ranking depends on.
 */
import { Uuid } from './valueTypes';

export class Referral {
  id!: Uuid;
  reportId!: Uuid;
  /** 8.6.2 — read from the pest profile, not chosen by the referring manager. */
  destinationAuthority!: string;
  /** 8.6.3 — shown to the resident in the notification 8.6.6 requires. */
  destinationContactNumber = '';
  referredAt!: Date;
  /** 8.6.4 — the Operations Manager account. */
  referredBy!: Uuid;
  reason!: string;
  /** 8.6.8 — null until an outcome is recorded. */
  outcome: string | null = null;
  /** 8.6.9 — setting this closes the report. */
  outcomeRecordedAt: Date | null = null;

  isClosed(): boolean {
    return this.outcomeRecordedAt !== null;
  }
}
