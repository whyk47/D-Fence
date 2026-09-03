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
 * A development-only `AuthProvider`. Passwords are stored as **salted scrypt hashes** (10.3.1) and
 * compared in constant time; the plaintext is never retained. Verification and reset tokens are
 * held in memory rather than emailed.
 */
export class LocalAuthProvider implements AuthProvider {
  private readonly users = new Map<AuthUserId, { email: string; salt: Buffer; hash: Buffer; disabled: boolean }>();
  private readonly resetTokens = new Map<string, { authUserId: AuthUserId; expiresAt: Date; used: boolean }>();
  /** What a real deployment would email. Exposed so 2.1.5 is observable in a test. */
  readonly verificationTokens = new Map<AuthUserId, string>();

  async register(credentials: AuthCredentials): Promise<AuthUserId> {
    const authUserId = await this.createUser(credentials);
    this.verificationTokens.set(authUserId, randomBytes(16).toString('base64url')); // 2.1.5
    return authUserId;
  }

  async createUser(credentials: AuthCredentials): Promise<AuthUserId> {
    if ([...this.users.values()].some((u) => u.email === credentials.email)) {
      throw new AuthenticationFailed(); // 2.1.4, defended here as well as in the controller
    }
    const authUserId = randomUUID();
    this.users.set(authUserId, { email: credentials.email, ...LocalAuthProvider.hash(credentials.password), disabled: false });
    return authUserId;
  }

  /**
   * 2.1.7. Throws `AuthenticationFailed` on a bad credential, which is what the controller counts
   * toward 2.1.10. 2.1.6's verification check is the controller's, because the Account row is
   * where `emailVerified` lives.
   */
  async signIn(credentials: AuthCredentials): Promise<AuthSession> {
    const entry = [...this.users.entries()].find(([, u]) => u.email === credentials.email);
    if (entry === undefined) {
      throw new AuthenticationFailed();
    }
    const [authUserId, user] = entry;
    if (user.disabled || !LocalAuthProvider.matches(credentials.password, user.salt, user.hash)) {
      throw new AuthenticationFailed();
    }
    return { authUserId, token: randomBytes(24).toString('base64url'), expiresAt: new Date(Date.now() + 86_400_000) };
  }

  async signOut(_token: string): Promise<void> {
    // Sessions are ours, not the provider's — `AuthenticationController` has already terminated it.
  }

  /** 2.1.11 — thirty minutes, single use. */
  async requestPasswordReset(email: string): Promise<void> {
    const entry = [...this.users.entries()].find(([, u]) => u.email === email);
    if (entry === undefined) {
      return; // silence, so the reset form is not a directory of registered addresses
    }
    this.resetTokens.set(randomBytes(16).toString('base64url'), {
      authUserId: entry[0],
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      used: false,
    });
  }

  async completePasswordReset(token: string, newPassword: string): Promise<void> {
    const entry = this.resetTokens.get(token);
    if (entry === undefined || entry.used || entry.expiresAt.getTime() < Date.now()) {
      throw new AuthenticationFailed(); // 2.1.11 — expired or already used
    }
    const user = this.users.get(entry.authUserId);
    if (user === undefined) {
      throw new AuthenticationFailed();
    }
    Object.assign(user, LocalAuthProvider.hash(newPassword));
    entry.used = true; // usable once
  }

  async verifyToken(_token: string): Promise<AuthUserId | null> {
    // Bearer tokens are ours (see `SessionStore`), so nothing to verify provider-side.
    return null;
  }

  async disableUser(authUserId: AuthUserId): Promise<void> {
    const user = this.users.get(authUserId);
    if (user !== undefined) {
      user.disabled = true;
    }
  }

  async enableUser(authUserId: AuthUserId): Promise<void> {
    const user = this.users.get(authUserId);
    if (user !== undefined) {
      user.disabled = false;
    }
  }

  async deleteUser(authUserId: AuthUserId): Promise<void> {
    this.users.delete(authUserId);
  }

  /** Test hook: the single-use reset token that would have been emailed. */
  latestResetToken(): string | null {
    const tokens = [...this.resetTokens.entries()].filter(([, t]) => !t.used);
    return tokens.length === 0 ? null : (tokens[tokens.length - 1] as [string, unknown])[0];
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
