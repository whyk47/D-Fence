/**
 * D-Fence — entity class `Session`
 * Stereotype: <<entity>>. Traces: 2.1.8, 2.1.9, 2.1.12.
 *
 * Ours, not the provider's. Supabase issues its own token with its own expiry, but 2.1.9 is
 * **inactivity**, not age: a session used continuously for two days is valid and one left alone
 * for twenty-five hours is not. That is a rule about our requests, so it is counted on our side.
 */

import { Uuid } from './valueTypes';

/** 2.1.9 */
export const INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export class Session {
  id!: Uuid;
  accountId!: Uuid;
  /** The bearer token presented on each request. Random, and never derived from the account id. */
  token!: string;
  issuedAt!: Date;
  lastActiveAt!: Date;
  terminatedAt!: Date | null;

  /** 2.1.9, 2.1.12 — usable only while neither expired nor signed out. */
  isValid(now: Date): boolean {
    return this.terminatedAt === null && !this.hasExpired(now);
  }

  /** 2.1.9 — twenty-four hours since the last request, not since sign-in. */
  hasExpired(now: Date): boolean {
    return now.getTime() - this.lastActiveAt.getTime() > INACTIVITY_TIMEOUT_MS;
  }

  /**
   * Extends the session on use. Called on every authenticated request, which is what makes 2.1.9
   * an inactivity timeout rather than an absolute one.
   */
  touch(now: Date): void {
    this.lastActiveAt = now;
  }

  /** 2.1.12 — sign-out. Terminated rather than deleted, so the audit trail still resolves. */
  terminate(now: Date): void {
    this.terminatedAt = now;
  }
}
