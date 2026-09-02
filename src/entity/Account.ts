/**
 * D-Fence — entity class `Account`
 * Stereotype: <<entity>>. Traces: 2.1.x, 2.2.1
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class Account {
  id!: Uuid;
  email!: string;
  /**
   * The provider's identity for this user. Supabase Auth owns the credential and the password hash
   * (2.1.7, 10.3.1); this row is the profile the rest of the system joins against. Decided
   * 2026-09-03 — see lab3/DESIGN-MODEL.md §3.3.
   */
  authUserId!: string;
  emailVerified!: boolean;
  /** one role per account (2.2.1) */
  role!: Role;
  isActive!: boolean;
  private failedAttempts!: number;
  private lockedUntil!: Date | null;
  telegramChatId!: string | null;
  createdAt!: Date;

  /**
   * True while a lock-out from repeated failures is in force.
   * 2.1.10 is precise — five consecutive failures within fifteen minutes, locking for fifteen — and
   * no Supabase setting expresses exactly that, so failedAttempts and lockedUntil stay ours and
   * this rule is enforced in AuthenticationController around the provider call.
   */
  isLocked(now: Date): boolean {
    // TODO
    throw new Error('not implemented');
  }

  /** Role check used by AccessControlService; never by a screen. */
  canAssume(role: Role): boolean {
    // TODO
    throw new Error('not implemented');
  }
}
