/**
 * D-Fence — in-memory accounts, sessions, and a local authentication provider.
 * Stereotype: <<persistence>>. Traces: 2.1.x, 2.2.x, 10.3.1, 10.6.3.
 *
 * `LocalAuthProvider` is the one class here that needs justifying rather than merely explaining.
 * Supabase Auth is the decision (see `ports/AuthProvider.ts`) and the Supabase project does not
 * exist yet, so signing in would be untestable and undemonstrable until it does. This implements
 * the same port locally — **with real salted scrypt hashing**, never plaintext — so that §2 can be
 * driven end to end today and swapped for Supabase by changing one line in `server.ts`.
 *
 * What it deliberately does NOT do: send email. `register` records the verification token instead
 * of mailing it, and the token is readable from the object, which is exactly what a test needs and
 * exactly what production must not have. It is development scaffolding and is named to say so.
 */
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { AccountStore, SessionStore } from '../../ports/Stores';
import { AuthCredentials, AuthProvider, AuthSession, AuthUserId, AuthenticationFailed } from '../../ports/AuthProvider';
import { CredentialRecord, CredentialStore, IssuedToken } from '../../ports/CredentialStore';
import { Uuid } from '../../entity/valueTypes';
import { Role } from '../../entity/enums';
import { Account } from '../../entity/Account';
import { Session } from '../../entity/Session';

export class InMemoryAccountStore implements AccountStore {
  private readonly accounts = new Map<Uuid, Account>();

  async findById(id: Uuid): Promise<Account | null> {
    return this.accounts.get(id) ?? null;
  }

  /** 2.1.4. Matched on the normalised address; the controller lowercases before it gets here. */
  async findByEmail(email: string): Promise<Account | null> {
    return [...this.accounts.values()].find((a) => a.email === email) ?? null;
  }

  async findByAuthUserId(authUserId: string): Promise<Account | null> {
    return [...this.accounts.values()].find((a) => a.authUserId === authUserId) ?? null;
  }

  async save(account: Account): Promise<Account> {
    account.id = account.id || randomUUID();
    this.accounts.set(account.id, account);
    return account;
  }

  async findByRole(role: Role): Promise<Account[]> {
    return [...this.accounts.values()].filter((a) => a.role === role);
  }

  /** Test and dev convenience; not part of the port. */
  all(): Account[] {
    return [...this.accounts.values()];
  }
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();

  async findByToken(token: string): Promise<Session | null> {
    return this.sessions.get(token) ?? null;
  }

  async save(session: Session): Promise<Session> {
    session.id = session.id || randomUUID();
    this.sessions.set(session.token, session);
    return session;
  }

  /** 2.2.4, 2.2.5 — deactivation must not leave a live session behind it. */
  async terminateAllFor(accountId: Uuid, at: Date): Promise<number> {
    let ended = 0;
    for (const session of this.sessions.values()) {
      if (session.accountId === accountId && session.terminatedAt === null) {
        session.terminate(at);
        ended += 1;
      }
    }
    return ended;
  }

  liveCount(): number {
    return [...this.sessions.values()].filter((s) => s.terminatedAt === null).length;
  }
}

/**
 * The default `CredentialStore`: three maps, which is exactly what `LocalAuthProvider` held before
 * the storage was split out of it. Bound whenever there is no database, and by every unit test.
 */
export class InMemoryCredentialStore implements CredentialStore {
  private readonly users = new Map<AuthUserId, CredentialRecord>();
  private readonly verifications = new Map<AuthUserId, string>();
  private readonly resets = new Map<string, IssuedToken>();

  async findByEmail(email: string): Promise<CredentialRecord | null> {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }

  async findById(authUserId: AuthUserId): Promise<CredentialRecord | null> {
    return this.users.get(authUserId) ?? null;
  }

  async insert(record: CredentialRecord): Promise<void> {
    this.users.set(record.authUserId, record);
  }

  async updateSecret(authUserId: AuthUserId, salt: Buffer, hash: Buffer): Promise<void> {
    const user = this.users.get(authUserId);
    if (user !== undefined) {
      this.users.set(authUserId, { ...user, salt, hash });
    }
  }

  async setDisabled(authUserId: AuthUserId, disabled: boolean): Promise<void> {
    const user = this.users.get(authUserId);
    if (user !== undefined) {
      this.users.set(authUserId, { ...user, disabled });
    }
  }

  async delete(authUserId: AuthUserId): Promise<void> {
    this.users.delete(authUserId);
    this.verifications.delete(authUserId);
  }

  async putVerification(authUserId: AuthUserId, token: string): Promise<void> {
    this.verifications.set(authUserId, token);
  }

  async verificationTokenFor(authUserId: AuthUserId): Promise<string | null> {
    return this.verifications.get(authUserId) ?? null;
  }

  async takeVerification(token: string): Promise<AuthUserId | null> {
    for (const [authUserId, issued] of this.verifications) {
      if (issued === token) {
        this.verifications.delete(authUserId);
        return authUserId;
      }
    }
    return null;
  }

  async putReset(token: string, authUserId: AuthUserId, expiresAt: Date): Promise<void> {
    this.resets.set(token, { authUserId, expiresAt, used: false });
  }

  async findReset(token: string): Promise<IssuedToken | null> {
    return this.resets.get(token) ?? null;
  }

  async markResetUsed(token: string): Promise<void> {
    const entry = this.resets.get(token);
    if (entry !== undefined) {
      this.resets.set(token, { ...entry, used: true });
    }
  }

  async latestResetToken(): Promise<string | null> {
    const outstanding = [...this.resets.entries()].filter(([, t]) => !t.used);
    return outstanding.length === 0 ? null : (outstanding[outstanding.length - 1] as [string, IssuedToken])[0];
  }
}

/**
 * A development-only `AuthProvider`. Passwords are stored as **salted scrypt hashes** (10.3.1) and
 * compared in constant time; the plaintext is never retained. Verification and reset tokens are
 * issued here rather than emailed.
 *
 * The *storage* is injected (`CredentialStore`) so that the deployment can keep credentials in
 * Postgres while the rules — hashing, the constant-time comparison, single use, and silence on an
 * unknown email — stay in one class. Held in memory, a restart left every account still present
 * with a role and a staff-list entry, and nobody able to sign in to it.
 */
export class LocalAuthProvider implements AuthProvider {
  constructor(private readonly store: CredentialStore = new InMemoryCredentialStore()) {}

  async register(credentials: AuthCredentials): Promise<AuthUserId> {
    const authUserId = await this.createUser(credentials);
    const token = randomBytes(16).toString('base64url'); // 2.1.5
    await this.store.putVerification(authUserId, token);
    // Printed because there is no mail server. 2.1.6 refuses an unverified account, so without
    // this a resident who registers can never sign in and the demo has no resident in it. This is
    // the single most development-only line in the codebase, and it is in the class whose name
    // says so; a deployment that reaches production with `LocalAuthProvider` bound has a much
    // larger problem than this log line.
    console.log(`[dev] verification token for ${credentials.email}: ${token}`);
    return authUserId;
  }

  async createUser(credentials: AuthCredentials): Promise<AuthUserId> {
    if ((await this.store.findByEmail(credentials.email)) !== null) {
      throw new AuthenticationFailed(); // 2.1.4, defended here as well as in the controller
    }
    const authUserId = randomUUID();
    await this.store.insert({
      authUserId,
      email: credentials.email,
      ...LocalAuthProvider.hash(credentials.password),
      disabled: false,
    });
    return authUserId;
  }

  /**
   * Seeding, and only seeding: create this credential, or bring the existing one into line.
   *
   * The seeded manager and resident are re-established on every boot from configuration, and with
   * credentials in memory that was `createUser` every time — which now raises 2.1.4's duplicate on
   * the second boot and aborts start-up. Making it idempotent here rather than at the call site
   * keeps 2.1.4 strict where it matters: `createUser` still refuses a duplicate, because a
   * *registration* that quietly overwrote a password would be an account takeover.
   *
   * It re-enables as well as re-hashes, so that changing `DFENCE_SEED_MANAGER_PASSWORD` and
   * restarting is a working way to rotate the seeded password — the only way an operator has,
   * since there is no mail server behind 2.1.11's reset.
   *
   * @returns the provider id to bind to the account, existing or new
   */
  async ensureUser(credentials: AuthCredentials): Promise<AuthUserId> {
    const existing = await this.store.findByEmail(credentials.email);
    if (existing === null) {
      return this.createUser(credentials);
    }
    const secret = LocalAuthProvider.hash(credentials.password);
    await this.store.updateSecret(existing.authUserId, secret.salt, secret.hash);
    await this.store.setDisabled(existing.authUserId, false);
    return existing.authUserId;
  }

  /**
   * 2.1.7. Throws `AuthenticationFailed` on a bad credential, which is what the controller counts
   * toward 2.1.10. 2.1.6's verification check is the controller's, because the Account row is
   * where `emailVerified` lives.
   */
  async signIn(credentials: AuthCredentials): Promise<AuthSession> {
    const user = await this.store.findByEmail(credentials.email);
    if (user === null) {
      throw new AuthenticationFailed();
    }
    if (user.disabled || !LocalAuthProvider.matches(credentials.password, user.salt, user.hash)) {
      throw new AuthenticationFailed();
    }
    return {
      authUserId: user.authUserId,
      token: randomBytes(24).toString('base64url'),
      expiresAt: new Date(Date.now() + 86_400_000),
    };
  }

  async signOut(_token: string): Promise<void> {
    // Sessions are ours, not the provider's — `AuthenticationController` has already terminated it.
  }

  /** 2.1.11 — thirty minutes, single use. */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.store.findByEmail(email);
    if (user === null) {
      return; // silence, so the reset form is not a directory of registered addresses
    }
    await this.store.putReset(
      randomBytes(16).toString('base64url'),
      user.authUserId,
      new Date(Date.now() + 30 * 60 * 1000),
    );
  }

  async completePasswordReset(token: string, newPassword: string): Promise<void> {
    const entry = await this.store.findReset(token);
    if (entry === null || entry.used || (entry.expiresAt?.getTime() ?? 0) < Date.now()) {
      throw new AuthenticationFailed(); // 2.1.11 — expired or already used
    }
    if ((await this.store.findById(entry.authUserId)) === null) {
      throw new AuthenticationFailed();
    }
    const secret = LocalAuthProvider.hash(newPassword);
    await this.store.updateSecret(entry.authUserId, secret.salt, secret.hash);
    await this.store.markResetUsed(token); // usable once
  }

  /** 2.1.5, 2.1.6. Single use, like the reset link. */
  async consumeVerification(token: string): Promise<AuthUserId | null> {
    return this.store.takeVerification(token);
  }

  async verifyToken(_token: string): Promise<AuthUserId | null> {
    // Bearer tokens are ours (see `SessionStore`), so nothing to verify provider-side.
    return null;
  }

  async disableUser(authUserId: AuthUserId): Promise<void> {
    await this.store.setDisabled(authUserId, true);
  }

  async enableUser(authUserId: AuthUserId): Promise<void> {
    await this.store.setDisabled(authUserId, false);
  }

  async deleteUser(authUserId: AuthUserId): Promise<void> {
    await this.store.delete(authUserId);
  }

  /** Test hook: the outstanding verification token that would have been emailed (2.1.5). */
  verificationTokenFor(authUserId: AuthUserId): Promise<string | null> {
    return this.store.verificationTokenFor(authUserId);
  }

  /** Test hook: the single-use reset token that would have been emailed. */
  latestResetToken(): Promise<string | null> {
    return this.store.latestResetToken();
  }

  private static hash(password: string): { salt: Buffer; hash: Buffer } {
    const salt = randomBytes(16);
    return { salt, hash: scryptSync(password, salt, 64) };
  }

  /** Constant-time, so a wrong password cannot be narrowed down by how long the answer takes. */
  private static matches(password: string, salt: Buffer, hash: Buffer): boolean {
    return timingSafeEqual(scryptSync(password, salt, 64), hash);
  }
}
