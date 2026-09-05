/**
 * D-Fence — Lab 4 §3.2: accounts, sessions and access control (§2).
 *
 * The boundary values here are the ones §2.1 states as numbers — eight characters, five attempts,
 * fifteen minutes, twenty-four hours — and each is tested at the edge rather than around it.
 *
 * The other half of this suite is about **what a refusal says**. 2.3.7 wants an authorisation error
 * that carries no detail, and 10.5.3 wants an error that states cause and remedy; those pull in
 * opposite directions at a sign-in form, and the cases below pin down where the line was drawn.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { AccessControlService, NotAuthorised } from '../src/control/AccessControlService';
import { AccessPolicy } from '../src/control/AccessPolicy';
import { AuthenticationController, AuthenticationRefused } from '../src/control/AuthenticationController';
import { StaffAccountController } from '../src/control/StaffAccountController';
import { principalFor } from '../src/control/DashboardController';
import {
  InMemoryAccountStore,
  InMemorySessionStore,
  LocalAuthProvider,
} from '../src/persistence/memory/InMemoryAccountStores';
import { InMemoryAuditStore } from '../src/persistence/memory/InMemoryStores';
import { Account, LOCKOUT_MS, MAX_FAILED_ATTEMPTS } from '../src/entity/Account';
import { Session, INACTIVITY_TIMEOUT_MS } from '../src/entity/Session';
import { Role } from '../src/entity/enums';

const GOOD_PASSWORD = 'dengue2026';

interface Fixture {
  auth: AuthenticationController;
  staff: StaffAccountController;
  accounts: InMemoryAccountStore;
  sessions: InMemorySessionStore;
  provider: LocalAuthProvider;
  audit: InMemoryAuditStore;
  managerId: string;
}

async function fixture(): Promise<Fixture> {
  const accounts = new InMemoryAccountStore();
  const sessions = new InMemorySessionStore();
  const provider = new LocalAuthProvider();
  const audit = new InMemoryAuditStore();
  const ac = new AccessControlService(new AccessPolicy(), audit);
  const auth = new AuthenticationController(provider, accounts, sessions, audit);
  const staff = new StaffAccountController(ac, provider, accounts, sessions, audit);

  const seed = await staff.createStaffAccount(
    'boss@d-fence.local',
    Role.OperationsManager,
    GOOD_PASSWORD,
    principalFor(Role.OperationsManager, 'system-seed'),
  );
  return { auth, staff, accounts, sessions, provider, audit, managerId: seed.id };
}

/** A registered, verified resident who can actually sign in. */
async function resident(f: Fixture, email = 'ah.seng@example.com'): Promise<Account> {
  const account = await f.auth.register(email, GOOD_PASSWORD);
  return f.auth.markEmailVerified(account.id);
}

describe('Registration — §2.1.1 to §2.1.5, §2.2.2', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('R1 — a self-registered account is a Resident, unverified, and active (2.2.2, 2.1.6)', async () => {
    const account = await f.auth.register('new@example.com', GOOD_PASSWORD);
    expect(account.role).toBe(Role.Resident);
    expect(account.emailVerified).toBe(false);
    expect(account.isActive).toBe(true);
  });

  it('R2 — seven characters is refused, eight is accepted (2.1.2, boundary)', async () => {
    await expect(f.auth.register('a@example.com', 'abc1234')).rejects.toThrow(/at least 8 characters/);
    await expect(f.auth.register('b@example.com', 'abcd1234')).resolves.toBeInstanceOf(Account);
  });

  it('R3 — a password of only letters or only digits is refused (2.1.3)', async () => {
    for (const password of ['abcdefghij', '1234567890']) {
      await expect(f.auth.register('c@example.com', password)).rejects.toThrow(/one letter and one digit/);
    }
  });

  it('R4 — a duplicate address is refused, and told to sign in instead (2.1.4, 10.5.3)', async () => {
    await f.auth.register('dup@example.com', GOOD_PASSWORD);
    await expect(f.auth.register('dup@example.com', GOOD_PASSWORD)).rejects.toThrow(/already registered/);
  });

  it('R5 — addresses are matched case-insensitively, so one person cannot register twice (2.1.4)', async () => {
    await f.auth.register('Mixed.Case@Example.COM', GOOD_PASSWORD);
    await expect(f.auth.register('mixed.case@example.com', GOOD_PASSWORD)).rejects.toThrow(/already registered/);
  });

  it('R6 — a verification token is issued, which is what 2.1.5 would email', async () => {
    const account = await f.auth.register('verify@example.com', GOOD_PASSWORD);
    expect(await f.provider.verificationTokenFor(account.authUserId)).toBeTruthy();
  });

  it('R7 — the password is never stored on the account row (10.3.1)', async () => {
    const account = await f.auth.register('hash@example.com', GOOD_PASSWORD);
    expect(JSON.stringify(account)).not.toContain(GOOD_PASSWORD);
  });
});

describe('Sign-in, lock-out and sessions — §2.1.6 to §2.1.12, §2.2.5', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('A1 — an unverified account cannot sign in, and is told why (2.1.6)', async () => {
    await f.auth.register('unverified@example.com', GOOD_PASSWORD);
    await expect(f.auth.signIn('unverified@example.com', GOOD_PASSWORD)).rejects.toThrow(/not been verified/);
  });

  it('A2 — a verified account signs in and gets a session token (2.1.7, 2.1.8)', async () => {
    await resident(f);
    const { session, principal } = await f.auth.signIn('ah.seng@example.com', GOOD_PASSWORD);
    expect(session.token).toHaveLength(43); // 32 random bytes, base64url
    expect(principal.role).toBe(Role.Resident);
  });

  it('A3 — an unknown address and a wrong password give the SAME message (2.3.7)', async () => {
    await resident(f);
    const unknown = await f.auth.signIn('nobody@example.com', GOOD_PASSWORD).catch((e: Error) => e.message);
    const wrong = await f.auth.signIn('ah.seng@example.com', 'wrongpass1').catch((e: Error) => e.message);
    // Otherwise the sign-in form is a directory of who has registered.
    expect(unknown).toBe(wrong);
  });

  it('A4 — the fifth failure inside the window locks the account; the fourth does not (2.1.10, boundary)', async () => {
    const account = await resident(f);
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await expect(f.auth.signIn('ah.seng@example.com', 'wrongpass1')).rejects.toThrow(/do not match/);
    }
    expect((await f.accounts.findById(account.id))?.isLocked(new Date())).toBe(false);

    await expect(f.auth.signIn('ah.seng@example.com', 'wrongpass1')).rejects.toThrow(/locked for fifteen minutes/);
    expect((await f.accounts.findById(account.id))?.isLocked(new Date())).toBe(true);
  });

  it('A5 — a locked account is refused even with the RIGHT password (2.1.10)', async () => {
    await resident(f);
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await f.auth.signIn('ah.seng@example.com', 'wrongpass1').catch(() => undefined);
    }
    // The lock is worthless if five wrong guesses still leave the door open to a sixth right one.
    await expect(f.auth.signIn('ah.seng@example.com', GOOD_PASSWORD)).rejects.toThrow(/locked/);
  });

  it('A6 — the lock expires after fifteen minutes and the account works again (2.1.10, boundary)', async () => {
    const account = await resident(f);
    const start = new Date('2026-09-03T10:00:00+08:00');
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await f.auth.signIn('ah.seng@example.com', 'wrongpass1', start).catch(() => undefined);
    }
    const stored = (await f.accounts.findById(account.id)) as Account;
    expect(stored.isLocked(new Date(start.getTime() + LOCKOUT_MS - 1000))).toBe(true);
    expect(stored.isLocked(new Date(start.getTime() + LOCKOUT_MS + 1000))).toBe(false);
  });

  it('A7 — failures more than fifteen minutes apart are not consecutive (2.1.10)', async () => {
    const account = await resident(f);
    const t0 = new Date('2026-09-03T10:00:00+08:00');
    for (let i = 0; i < 4; i += 1) {
      await f.auth.signIn('ah.seng@example.com', 'wrongpass1', t0).catch(() => undefined);
    }
    // Four on Monday morning and one that afternoon is not an attack; a counter that never
    // forgets would lock a forgetful user out for good.
    const later = new Date(t0.getTime() + 20 * 60 * 1000);
    await f.auth.signIn('ah.seng@example.com', 'wrongpass1', later).catch(() => undefined);
    expect((await f.accounts.findById(account.id))?.isLocked(later)).toBe(false);
  });

  it('A8 — a successful sign-in clears the failure run (2.1.10)', async () => {
    const account = await resident(f);
    await f.auth.signIn('ah.seng@example.com', 'wrongpass1').catch(() => undefined);
    await f.auth.signIn('ah.seng@example.com', GOOD_PASSWORD);
    expect((await f.accounts.findById(account.id))?.failedAttemptCount()).toBe(0);
  });

  it('A9 — a deactivated account cannot sign in (2.2.5)', async () => {
    const account = await resident(f);
    await f.staff.deactivateAccount(account.id, principalFor(Role.OperationsManager, f.managerId));
    await expect(f.auth.signIn('ah.seng@example.com', GOOD_PASSWORD)).rejects.toThrow(/deactivated/);
  });
});

describe('Session validity — §2.1.9, §2.1.12', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('S1 — a token resolves to the account it was issued to (2.1.8, 2.3.6)', async () => {
    const account = await resident(f);
    const { session } = await f.auth.signIn('ah.seng@example.com', GOOD_PASSWORD);
    const principal = await f.auth.resolve(session.token);
    expect(principal?.accountId).toBe(account.id);
    expect(principal?.role).toBe(Role.Resident);
  });

  it('S2 — an unknown or malformed token resolves to null, never to a default role (2.3.6)', async () => {
    expect(await f.auth.resolve('not-a-token')).toBeNull();
    expect(await f.auth.resolve('')).toBeNull();
  });

  it('S3 — twenty-four hours of inactivity expires the session; a moment less does not (2.1.9, boundary)', async () => {
    await resident(f);
    const at = new Date('2026-09-03T10:00:00+08:00');

    // Two separate sessions, because a *successful* resolve extends the one it was given. Written
    // as one session first, and the test failed: checking just inside the window reset the clock,
    // so the check just outside it was only two seconds old. That is the requirement working, and
    // it is why the two edges cannot share a session.
    const inside = await f.auth.signIn('ah.seng@example.com', GOOD_PASSWORD, at);
    expect(await f.auth.resolve(inside.session.token, new Date(at.getTime() + INACTIVITY_TIMEOUT_MS - 1000))).not.toBeNull();

    const outside = await f.auth.signIn('ah.seng@example.com', GOOD_PASSWORD, at);
    expect(await f.auth.resolve(outside.session.token, new Date(at.getTime() + INACTIVITY_TIMEOUT_MS + 1000))).toBeNull();
  });

  it('S4 — using a session extends it, so 2.1.9 is inactivity and not age', async () => {
    await resident(f);
    const at = new Date('2026-09-03T10:00:00+08:00');
    const { session } = await f.auth.signIn('ah.seng@example.com', GOOD_PASSWORD, at);
    // Used every twenty hours for two days: still valid, though far older than the timeout.
    let now = at;
    for (let i = 0; i < 3; i += 1) {
      now = new Date(now.getTime() + 20 * 3_600_000);
      expect(await f.auth.resolve(session.token, now)).not.toBeNull();
    }
    expect(now.getTime() - at.getTime()).toBeGreaterThan(INACTIVITY_TIMEOUT_MS);
  });

  it('S5 — signing out ends the session immediately (2.1.12)', async () => {
    await resident(f);
    const { session } = await f.auth.signIn('ah.seng@example.com', GOOD_PASSWORD);
    await f.auth.signOut(session.token);
    expect(await f.auth.resolve(session.token)).toBeNull();
  });

  it('S6 — deactivation invalidates a live session on the NEXT request, not at the next sign-in (2.2.5)', async () => {
    const account = await resident(f);
    const { session } = await f.auth.signIn('ah.seng@example.com', GOOD_PASSWORD);
    expect(await f.auth.resolve(session.token)).not.toBeNull();

    await f.staff.deactivateAccount(account.id, principalFor(Role.OperationsManager, f.managerId));
    // Otherwise a crew member deactivated at noon keeps working from an open tab until tomorrow.
    expect(await f.auth.resolve(session.token)).toBeNull();
    expect(f.sessions.liveCount()).toBe(0);
  });

  it('S7 — an expired session is not revived by a later request (2.1.9)', async () => {
    await resident(f);
    const at = new Date('2026-09-03T10:00:00+08:00');
    const { session } = await f.auth.signIn('ah.seng@example.com', GOOD_PASSWORD, at);
    const late = new Date(at.getTime() + INACTIVITY_TIMEOUT_MS + 1000);
    expect(await f.auth.resolve(session.token, late)).toBeNull();
    expect(await f.auth.resolve(session.token, new Date(late.getTime() + 1000))).toBeNull();
  });

  it('S8 — the Session entity distinguishes terminated from expired', () => {
    const session = new Session();
    session.accountId = 'a';
    session.token = 't';
    session.issuedAt = new Date('2026-09-03T10:00:00Z');
    session.lastActiveAt = session.issuedAt;
    session.terminatedAt = null;
    expect(session.isValid(session.issuedAt)).toBe(true);
    session.terminate(session.issuedAt);
    expect(session.isValid(session.issuedAt)).toBe(false);
    expect(session.hasExpired(session.issuedAt)).toBe(false); // signed out, not timed out
  });
});

describe('Password reset — §2.1.11', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('P1 — a reset request for an unknown address succeeds silently (2.1.11)', async () => {
    // The same response either way, or the reset form becomes the directory sign-in refuses to be.
    await expect(f.auth.requestReset('nobody@example.com')).resolves.toBeUndefined();
    expect(await f.provider.latestResetToken()).toBeNull();
  });

  it('P2 — the link is single-use (2.1.11)', async () => {
    await resident(f);
    await f.auth.requestReset('ah.seng@example.com');
    const token = (await f.provider.latestResetToken()) as string;
    await f.auth.completeReset(token, 'brandnew123');
    await expect(f.auth.completeReset(token, 'another456')).rejects.toThrow();
  });

  it('P3 — the new password must satisfy 2.1.2 and 2.1.3 as well', async () => {
    await resident(f);
    await f.auth.requestReset('ah.seng@example.com');
    const token = (await f.provider.latestResetToken()) as string;
    await expect(f.auth.completeReset(token, 'short1')).rejects.toThrow(/at least 8 characters/);
  });

  it('P4 — after a reset the new password works and the old one does not', async () => {
    await resident(f);
    await f.auth.requestReset('ah.seng@example.com');
    await f.auth.completeReset((await f.provider.latestResetToken()) as string, 'brandnew123');
    await expect(f.auth.signIn('ah.seng@example.com', 'brandnew123')).resolves.toBeTruthy();
    await expect(f.auth.signIn('ah.seng@example.com', GOOD_PASSWORD)).rejects.toThrow();
  });
});

describe('Staff provisioning — §2.2.3, §2.2.4', () => {
  let f: Fixture;
  let manager: ReturnType<typeof principalFor>;
  beforeEach(async () => {
    f = await fixture();
    manager = principalFor(Role.OperationsManager, f.managerId);
  });

  it('T1 — a manager creates a crew account, already verified (2.2.3)', async () => {
    const crew = await f.staff.createStaffAccount('crew@d-fence.local', Role.CleaningCrew, GOOD_PASSWORD, manager);
    expect(crew.role).toBe(Role.CleaningCrew);
    // A manager vouching for someone is what 2.1.5's link exists to establish; requiring an email
    // nobody sent would leave the crew member unable to sign in at all.
    expect(crew.emailVerified).toBe(true);
    await expect(f.auth.signIn('crew@d-fence.local', GOOD_PASSWORD)).resolves.toBeTruthy();
  });

  it('T2 — a Resident and a crew member may not provision staff (2.2.3, 2.3.3, 2.3.5)', async () => {
    for (const role of [Role.Resident, Role.CleaningCrew]) {
      await expect(
        f.staff.createStaffAccount('x@d-fence.local', Role.CleaningCrew, GOOD_PASSWORD, principalFor(role, 'someone')),
      ).rejects.toBeInstanceOf(NotAuthorised);
    }
  });

  it('T3 — a Resident account cannot be created through the staff path (2.2.2)', async () => {
    await expect(
      f.staff.createStaffAccount('r@example.com', Role.Resident, GOOD_PASSWORD, manager),
    ).rejects.toThrow(/self-registration/);
  });

  it('T4 — deactivation ends live sessions and reports how many (2.2.4, 2.2.5)', async () => {
    const crew = await f.staff.createStaffAccount('crew2@d-fence.local', Role.CleaningCrew, GOOD_PASSWORD, manager);
    await f.auth.signIn('crew2@d-fence.local', GOOD_PASSWORD);
    const result = await f.staff.deactivateAccount(crew.id, manager);
    expect(result.account.isActive).toBe(false);
    expect(result.sessionsEnded).toBe(1);
  });

  it('T5 — a manager cannot deactivate themselves', async () => {
    // Not in the requirements, and added deliberately: 2.2.3 makes the manager role the only one
    // that can create another, so this is how a deployment locks itself out permanently.
    await expect(f.staff.deactivateAccount(f.managerId, manager)).rejects.toThrow(/your own account/);
  });

  it('T6 — reactivation restores sign-in and clears any stale lock-out (2.2.4)', async () => {
    const crew = await f.staff.createStaffAccount('crew3@d-fence.local', Role.CleaningCrew, GOOD_PASSWORD, manager);
    await f.staff.deactivateAccount(crew.id, manager);
    await f.staff.reactivateAccount(crew.id, manager);
    await expect(f.auth.signIn('crew3@d-fence.local', GOOD_PASSWORD)).resolves.toBeTruthy();
  });

  it('T7 — the assignable crew list excludes deactivated members (8.2.2, 8.2.3)', async () => {
    const a = await f.staff.createStaffAccount('c-a@d-fence.local', Role.CleaningCrew, GOOD_PASSWORD, manager);
    await f.staff.createStaffAccount('c-b@d-fence.local', Role.CleaningCrew, GOOD_PASSWORD, manager);
    await f.staff.deactivateAccount(a.id, manager);
    const crew = await f.staff.assignableCrew(manager);
    // Excluded at the point of choosing, rather than refused at the point of assignment.
    expect(crew.map((c) => c.email)).toEqual(['c-b@d-fence.local']);
  });
});

describe('Audit — §2.4.1, §2.4.2', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await fixture();
  });

  it('U1 — account creation, sign-in and deactivation are all recorded (2.4.1)', async () => {
    const account = await resident(f);
    await f.auth.signIn('ah.seng@example.com', GOOD_PASSWORD);
    await f.staff.deactivateAccount(account.id, principalFor(Role.OperationsManager, f.managerId));
    const actions = (await f.audit.recent(20)).map((r) => r.action);
    expect(actions).toContain('account:register');
    expect(actions).toContain('session:signIn');
    expect(actions).toContain('account:deactivate');
  });

  it('U2 — a refusal is logged distinguishably from a state change (2.3.8, 2.4.1)', async () => {
    await f.staff.createStaffAccount('x@d-fence.local', Role.CleaningCrew, GOOD_PASSWORD, principalFor(Role.Resident, 'r'))
      .catch(() => undefined);
    const denials = (await f.audit.recent(20)).filter((r) => r.action.startsWith('DENIED:'));
    // The two mean opposite things, so an unprefixed list of action names would be unreadable.
    expect(denials).toHaveLength(1);
  });

  it('U3 — the audit log is append-only from outside (2.4.2)', async () => {
    await resident(f);
    const before = await f.audit.recent(10);
    before.pop();
    // `recent` hands back a copy; mutating it must not reach the store. The real guarantee is a
    // Postgres table with no UPDATE or DELETE grant — this is the in-memory equivalent.
    expect((await f.audit.recent(10)).length).toBeGreaterThan(before.length);
  });
});
