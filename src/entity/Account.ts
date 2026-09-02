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
  private passwordHash!: string;
  emailVerified!: boolean;
  /** one role per account (2.2.1) */
  role!: Role;
  isActive!: boolean;
  private failedAttempts!: number;
  private lockedUntil!: Date | null;
  telegramChatId!: string | null;
  createdAt!: Date;

  /** True while a lock-out from repeated failures is in force (2.1.x). */
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
