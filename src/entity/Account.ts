/**
 * D-Fence — entity class `Account`
 * Stereotype: <<entity>>. Traces: 2.1.6, 2.1.10, 2.2.1, 2.2.2, 2.2.5.
 *
 * The credential is **not** here. The provider owns the password hash (10.3.1); this row is the
 * profile the rest of the system joins against, and the two things it does own are the ones §2 is
 * precise about: the lock-out counter and the role.
 */

import { Uuid } from './valueTypes';
import { Role } from './enums';

/** 2.1.10, stated once. */
export const MAX_FAILED_ATTEMPTS = 5;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_MS = 15 * 60 * 1000;

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
  telegramChatId!: string | null;
  createdAt!: Date;

  /**
   * Private, and mutated only through the three methods below.
   *
   * 2.1.10 says **five consecutive failures within fifteen minutes**, so a bare counter is not
   * enough: two failures on Monday and three on Friday are not an attack, and a counter that never
   * forgets would lock that account. `firstFailureAt` is what makes the window real.
   */
  private failedAttempts = 0;
  private firstFailureAt: Date | null = null;
  private lockedUntil: Date | null = null;

  /**
   * True while a lock-out from repeated failures is in force.
   *
   * 2.1.10 is precise — five consecutive failures within fifteen minutes, locking for fifteen — and
   * no Supabase setting expresses exactly that, so this rule stays ours and is enforced in
   * `AuthenticationController` around the provider call.
   */
  isLocked(now: Date): boolean {
    return this.lockedUntil !== null && this.lockedUntil.getTime() > now.getTime();
  }

  lockedUntilTime(): Date | null {
    return this.lockedUntil;
  }

  /**
   * 2.1.10. Records one failed attempt and locks the account when the fifth lands inside the
   * window. @returns true when this failure caused the lock.
   */
  recordFailedAttempt(now: Date): boolean {
    const windowOpen =
      this.firstFailureAt !== null && now.getTime() - this.firstFailureAt.getTime() <= FAILURE_WINDOW_MS;
    if (!windowOpen) {
      // The window has closed, so this failure starts a new run. "Consecutive" is counted inside a
      // moving fifteen minutes, not for the life of the account.
      this.firstFailureAt = now;
      this.failedAttempts = 0;
    }
    this.failedAttempts += 1;
    if (this.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      this.lockedUntil = new Date(now.getTime() + LOCKOUT_MS);
      this.failedAttempts = 0;
      this.firstFailureAt = null;
      return true;
    }
    return false;
  }

  /** A successful authentication ends the run: "consecutive" means consecutive. */
  /**
   * The 2.1.10 counter as three values, for persistence only.
   *
   * The three are private because nothing in the application may set them directly — a counter a
   * controller can write is a lock-out a controller can skip. Rehydration is the one legitimate
   * exception, and it is expressed as a matched pair of methods on the entity rather than by
   * making the fields public, so the exception has exactly two call sites and both are in a
   * repository.
   */
  lockState(): { failedAttempts: number; firstFailureAt: Date | null; lockedUntil: Date | null } {
    return {
      failedAttempts: this.failedAttempts,
      firstFailureAt: this.firstFailureAt,
      lockedUntil: this.lockedUntil,
    };
  }

  /** Called only when reading a stored account back. See `lockState`. */
  restoreLockState(state: {
    failedAttempts: number;
    firstFailureAt: Date | null;
    lockedUntil: Date | null;
  }): void {
    this.failedAttempts = state.failedAttempts;
    this.firstFailureAt = state.firstFailureAt;
    this.lockedUntil = state.lockedUntil;
  }

  clearFailedAttempts(): void {
    this.failedAttempts = 0;
    this.firstFailureAt = null;
    this.lockedUntil = null;
  }

  failedAttemptCount(): number {
    return this.failedAttempts;
  }

  /**
   * 2.1.6, 2.2.5 — whether this account may authenticate at all, before the credential is even
   * considered. @returns null when it may, otherwise the reason it may not.
   */
  authenticationBlockedReason(now: Date): string | null {
    if (!this.isActive) {
      return 'this account has been deactivated'; // 2.2.5
    }
    if (!this.emailVerified) {
      return 'this email address has not been verified; check your inbox for the link'; // 2.1.6
    }
    if (this.isLocked(now)) {
      return 'too many failed attempts; this account is locked for fifteen minutes'; // 2.1.10
    }
    return null;
  }

  /** Role check used by AccessControlService; never by a screen (2.3.6). */
  canAssume(role: Role): boolean {
    return this.isActive && this.role === role;
  }
}
