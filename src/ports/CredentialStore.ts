/**
 * D-Fence — where the development auth provider keeps its secrets.
 * Layer: ports. Traces: 2.1.4, 2.1.5, 2.1.7, 2.1.11, 2.2.5, 10.2.3, 10.3.1.
 *
 * `LocalAuthProvider` is the stand-in for Supabase Auth, and it held every password hash, every
 * verification token and every reset token in three `Map`s. The `Account` row was already in
 * Postgres, so a restart produced the worst of both: the account still existed, still had a role,
 * still appeared in the staff list — and its owner could never sign in again. "Your account does
 * not exist" is a bad outcome; "your account exists and your password is wrong" is a worse one,
 * because the user retries, gets locked out under 2.1.10, and has evidence the system is lying.
 *
 * Splitting storage out of the provider rather than writing a second provider is deliberate: the
 * scrypt hashing, the constant-time comparison, the single-use rules and the silence on an unknown
 * email are *behaviour*, and a second class repeating them is a second class that can disagree
 * with the first about 2.1.11.
 *
 * **This is not a claim that the system should own credentials.** 10.3.1 says the provider does,
 * and the decision recorded in `AuthProvider` stands: when Supabase Auth is bound, this port and
 * both its implementations become dead code and should be deleted rather than kept "just in case".
 * What it fixes is that the development provider was losing data the deployment depended on.
 */
import { AuthUserId } from './AuthProvider';

/** One user's secret, as the provider needs it back. */
export interface CredentialRecord {
  authUserId: AuthUserId;
  email: string;
  /** Per-user, 16 random bytes. Never shared, so two identical passwords hash differently. */
  salt: Buffer;
  hash: Buffer;
  /** 2.2.5 — a deactivated account's credential still exists and must not authenticate. */
  disabled: boolean;
}

/** A single-use token and its deadline: 2.1.5's verification link and 2.1.11's reset link. */
export interface IssuedToken {
  authUserId: AuthUserId;
  expiresAt: Date | null;
  used: boolean;
}

export interface CredentialStore {
  findByEmail(email: string): Promise<CredentialRecord | null>;
  findById(authUserId: AuthUserId): Promise<CredentialRecord | null>;
  insert(record: CredentialRecord): Promise<void>;
  /** 2.1.11 — a completed reset replaces the salt as well as the hash, never only the hash. */
  updateSecret(authUserId: AuthUserId, salt: Buffer, hash: Buffer): Promise<void>;
  setDisabled(authUserId: AuthUserId, disabled: boolean): Promise<void>;
  delete(authUserId: AuthUserId): Promise<void>;

  /** 2.1.5. One outstanding verification token per user; issuing a second replaces the first. */
  putVerification(authUserId: AuthUserId, token: string): Promise<void>;
  verificationTokenFor(authUserId: AuthUserId): Promise<string | null>;
  /** @returns the user, and removes the token — it is single use (2.1.5). */
  takeVerification(token: string): Promise<AuthUserId | null>;

  /** 2.1.11 — thirty minutes, single use. Expiry is checked by the provider, not here. */
  putReset(token: string, authUserId: AuthUserId, expiresAt: Date): Promise<void>;
  findReset(token: string): Promise<IssuedToken | null>;
  markResetUsed(token: string): Promise<void>;
  /** Development affordance: the token a real deployment would have emailed. */
  latestResetToken(): Promise<string | null>;
}
