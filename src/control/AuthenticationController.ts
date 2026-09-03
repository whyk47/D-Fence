/**
 * D-Fence — registration, sign-in, sessions and password reset.
 * Stereotype: <<control>>. Realises use cases 1.1–1.3, 1.5. Traces: 2.1.1–2.1.12, 2.2.1, 2.2.2,
 * 2.2.5, 10.3.1, 10.5.3.
 *
 * Credentials go to the `AuthProvider` port (Supabase Auth, decided 2026-09-03). Three rules stay
 * here because the provider does not express them:
 *
 *  - **2.1.2 and 2.1.3**, the password rules, checked *before* the provider is called so the
 *    message can name the rule that failed rather than saying "invalid password" (10.5.3);
 *  - **2.1.10**, the lock-out, which is specified precisely enough — five consecutive failures in
 *    fifteen minutes, locking for fifteen — that no provider setting matches it;
 *  - **2.1.9**, session expiry, which is inactivity rather than age and so is counted against our
 *    requests.
 *
 * The role (2.2.1) is also ours, because the whole of §2.3 is written in terms of it.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { Role } from '../entity/enums';
import { Uuid } from '../entity/valueTypes';
import { Account } from '../entity/Account';
import { Session } from '../entity/Session';
import { AuthProvider, AuthenticationFailed } from '../ports/AuthProvider';
import { AccountStore, AuditStore, SessionStore } from '../ports/Stores';
import { Principal } from './Principal';

/** 2.1.2, 2.1.3 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * A refused sign-in or registration. One class for all of them, with the reason in the message.
 *
 * **The reason is deliberately generic for a bad credential and specific for everything else.**
 * 10.5.3 wants an error that states cause and remedy, but "no account with that email" turns the
 * sign-in form into a directory of who has registered. A wrong password and an unknown address
 * therefore give the same sentence; a locked, unverified or deactivated account — all of which the
 * caller already proved they can reach — say exactly what is wrong.
 */
export class AuthenticationRefused extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'AuthenticationRefused';
  }
}

const BAD_CREDENTIALS = 'that email address and password do not match an account';

export class AuthenticationController {
  constructor(
    private readonly auth: AuthProvider,
    private readonly accounts: AccountStore,
    private readonly sessions: SessionStore,
    private readonly audit: AuditStore | null = null,
  ) {}

  /**
   * 2.1.1–2.1.5, 2.2.1, 2.2.2. The password rules are checked first, then the duplicate address,
   * then the provider is asked to create the identity and send the verification link.
   *
   * @throws AuthenticationRefused naming the rule that failed
   */
  async register(email: string, password: string, now = new Date()): Promise<Account> {
    const address = AuthenticationController.normaliseEmail(email);
    const problem = AuthenticationController.passwordProblem(password);
    if (problem !== null) {
      throw new AuthenticationRefused(problem); // 2.1.2, 2.1.3
    }
    if ((await this.accounts.findByEmail(address)) !== null) {
      // 2.1.4. This one **does** disclose that the address is registered, and it has to: a
      // registration form that silently accepts a duplicate cannot tell the user to sign in
      // instead. The exposure is the same one the sign-in form refuses to give, which is why the
      // two are handled differently on purpose rather than by accident.
      throw new AuthenticationRefused('that email address is already registered; sign in instead');
    }

    const authUserId = await this.auth.register({ email: address, password }); // 2.1.5
    const account = new Account();
    account.email = address;
    account.authUserId = authUserId;
    account.emailVerified = false; // 2.1.6 — until the link is followed
    account.role = Role.Resident; // 2.2.2
    account.isActive = true;
    account.telegramChatId = null;
    account.createdAt = now;
    const saved = await this.accounts.save(account);
    await this.audit?.appendAction(saved.id, 'account:register', 'Account', saved.id); // 2.4.1
    return saved;
  }

  /**
   * 2.1.6–2.1.8, 2.1.10, 2.2.5. Issues a session, or refuses.
   *
   * The order is the point. The account's own state is checked **before** the credential reaches
   * the provider, so a locked account cannot be probed by continuing to guess: the lock-out means
   * nothing if five wrong passwords still get five more tries at the provider.
   *
   * @throws AuthenticationRefused
   */
  async signIn(email: string, password: string, now = new Date()): Promise<{ session: Session; principal: Principal }> {
    const address = AuthenticationController.normaliseEmail(email);
    const account = await this.accounts.findByEmail(address);
    if (account === null) {
      throw new AuthenticationRefused(BAD_CREDENTIALS); // an unknown address looks like a wrong one
    }
    const blocked = account.authenticationBlockedReason(now);
    if (blocked !== null) {
      throw new AuthenticationRefused(blocked); // 2.1.6, 2.1.10, 2.2.5
    }

    try {
      await this.auth.signIn({ email: address, password }); // 2.1.7
    } catch (error) {
      if (!(error instanceof AuthenticationFailed)) {
        throw error; // a provider outage is not a failed attempt and must not count toward 2.1.10
      }
      const locked = account.recordFailedAttempt(now); // 2.1.10
      await this.accounts.save(account);
      throw new AuthenticationRefused(
        locked ? 'too many failed attempts; this account is locked for fifteen minutes' : BAD_CREDENTIALS,
      );
    }

    account.clearFailedAttempts();
    await this.accounts.save(account);
    const session = await this.issueSession(account, now); // 2.1.8
    await this.audit?.appendAction(account.id, 'session:signIn', 'Session', session.id); // 2.4.1
    return { session, principal: new Principal(account.id, account.role, session.id) };
  }

  /**
   * The bearer token to a principal, or null. Called on every authenticated request, and the place
   * 2.1.9 is enforced: a valid presentation also **extends** the session, which is what makes the
   * timeout an inactivity one.
   */
  async resolve(token: string, now = new Date()): Promise<Principal | null> {
    const session = await this.sessions.findByToken(token);
    if (session === null || !session.isValid(now)) {
      return null;
    }
    const account = await this.accounts.findById(session.accountId);
    if (account === null || !account.isActive) {
      return null; // 2.2.5 — deactivation takes effect on the next request, not at the next sign-in
    }
    session.touch(now); // 2.1.9
    await this.sessions.save(session);
    return new Principal(account.id, account.role, session.id);
  }

  /** 2.1.12. Use case 1.5 — added after the Lab 1 critique found 2.1.12 unrepresented. */
  async signOut(token: string, now = new Date()): Promise<void> {
    const session = await this.sessions.findByToken(token);
    if (session === null) {
      return; // signing out of a session that is already gone is a success, not an error
    }
    session.terminate(now);
    await this.sessions.save(session);
    await this.auth.signOut(token);
    await this.audit?.appendAction(session.accountId, 'session:signOut', 'Session', session.id);
  }

  /**
   * 2.1.11. The same response whether or not the address exists — otherwise the reset form becomes
   * the directory the sign-in form refuses to be.
   */
  async requestReset(email: string): Promise<void> {
    const address = AuthenticationController.normaliseEmail(email);
    if ((await this.accounts.findByEmail(address)) !== null) {
      await this.auth.requestPasswordReset(address);
    }
  }

  /** 2.1.11. On success the user continues to Sign In — see the dialog map, ResetForm → SignIn. */
  async completeReset(token: string, password: string): Promise<void> {
    const problem = AuthenticationController.passwordProblem(password);
    if (problem !== null) {
      throw new AuthenticationRefused(problem); // 2.1.2, 2.1.3 apply to a reset as well
    }
    await this.auth.completePasswordReset(token, password);
  }

  /** Follows the 2.1.5 verification link. Until this runs, 2.1.6 refuses the account. */
  async markEmailVerified(accountId: Uuid): Promise<Account> {
    const account = await this.accounts.findById(accountId);
    if (account === null) {
      throw new AuthenticationRefused('no such account');
    }
    account.emailVerified = true;
    return this.accounts.save(account);
  }

  /** 2.1.8. A random token, never derived from the account id. */
  private async issueSession(account: Account, now: Date): Promise<Session> {
    const session = new Session();
    session.id = randomUUID();
    session.accountId = account.id;
    session.token = randomBytes(32).toString('base64url');
    session.issuedAt = now;
    session.lastActiveAt = now;
    session.terminatedAt = null;
    return this.sessions.save(session);
  }

  /**
   * 2.1.2, 2.1.3 — the two password rules, as one function so registration and reset cannot drift.
   * @returns null when acceptable, otherwise the rule that failed, worded for the user (10.5.3)
   */
  static passwordProblem(password: string): string | null {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `a password must be at least ${MIN_PASSWORD_LENGTH} characters`; // 2.1.2
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return 'a password must contain at least one letter and one digit'; // 2.1.3
    }
    return null;
  }

  /**
   * Addresses are matched case-insensitively and trimmed. Without this, 2.1.4's duplicate check
   * lets the same person register twice with different capitalisation, and each of them gets a
   * different set of saved locations.
   */
  static normaliseEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
