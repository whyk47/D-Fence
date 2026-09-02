/**
 * D-Fence — the authentication provider port.
 * Layer: ports. Traces: 2.1.1–2.1.12, 10.3.1.
 *
 * The team decided on 2026-09-03 to use Supabase Auth rather than hand-rolling credentials. The
 * interface exists anyway, for two reasons that matter more than provider-independence in the
 * abstract: a control class must be unit-testable without a network (10.6.3), and the boundary
 * between "what our system decides" and "what the provider does" has to be visible, because it is
 * not a clean split — see AuthenticationController for the two rules we still own.
 *
 * What the provider owns: the password hash (10.3.1), the verification email (2.1.5), the reset
 * link and its 30-minute single use (2.1.11), and session issuance and expiry (2.1.8, 2.1.9).
 * What we still own: the 2.1.10 lock-out, because it is specified precisely — five consecutive
 * failures in fifteen minutes, locking for fifteen — and no provider setting expresses that; and
 * the role (2.2.1), which is ours because §2.3 is written in terms of it.
 */
import { Uuid } from '../entity/valueTypes';

/** The provider's identity for a user. Distinct from Account.id, which is ours. */
export type AuthUserId = string;

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthSession {
  authUserId: AuthUserId;
  token: string;
  expiresAt: Date;
}

export interface AuthProvider {
  /** 2.1.1, 2.1.4. Rejects an address that is already registered. Sends the 2.1.5 verification. */
  register(credentials: AuthCredentials): Promise<AuthUserId>;

  /**
   * 2.1.6, 2.1.7, 2.1.8. Refuses an unverified address and issues a session on success.
   * Throws on bad credentials; the caller counts the failure for 2.1.10.
   */
  signIn(credentials: AuthCredentials): Promise<AuthSession>;

  /** 2.1.12. Terminates the active session. */
  signOut(token: string): Promise<void>;

  /** 2.1.11. Sends a reset link valid for 30 minutes and usable once. */
  requestPasswordReset(email: string): Promise<void>;

  /** 2.1.11. Consumes the link and sets the new password. */
  completePasswordReset(token: string, newPassword: string): Promise<void>;

  /** Verifies a bearer token and returns the provider identity it belongs to, or null. */
  verifyToken(token: string): Promise<AuthUserId | null>;

  /** 2.2.3. Creates a staff account without a self-registration flow. */
  createUser(credentials: AuthCredentials): Promise<AuthUserId>;

  /** Used by account deactivation; the Account row is retained so audit records still resolve. */
  disableUser(authUserId: AuthUserId): Promise<void>;

  /** 10.4.3. Deletes the provider-side identity on an account deletion request. */
  deleteUser(authUserId: AuthUserId): Promise<void>;
}

/** Raised when the provider refuses the credentials. The caller decides what it means for 2.1.10. */
export class AuthenticationFailed extends Error {
  constructor(readonly accountId?: Uuid) {
    super('authentication failed');
  }
}
