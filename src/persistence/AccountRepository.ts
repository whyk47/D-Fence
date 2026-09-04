/**
 * D-Fence — AccountRepository and SessionRepository.
 * Stereotype: <<persistence>>. Traces: 2.1.1–2.1.12, 2.2.3–2.2.5, 2.3.x, 6.1.6, 10.4.3.
 *
 * Implements `AccountStore` and `SessionStore` against Postgres.
 *
 * **These two were not optional once reports and work orders moved.** `report.reporter_id` and
 * `work_order.assignee_id` are real foreign keys into `account`, so with accounts still held in
 * memory the database refused every report a resident filed and every assignment a manager made —
 * a 500 rather than a silent wrong answer, which is the constraint doing its job. Persisting the
 * two aggregates without persisting the people they point at is not a half-migration, it is a
 * broken one.
 *
 * **What still does not survive a restart is the credential.** `LocalAuthProvider` holds the scrypt
 * hashes in memory, because it is the development stand-in for Supabase Auth (10.3.1: the provider
 * owns the credential, never this schema — there is no password column here and there must not be).
 * So after a restart the accounts, their roles, their lock-outs and their Telegram links are all
 * still here and a sign-in fails until the provider is the real one. That is stated rather than
 * papered over.
 */
import { randomUUID } from 'node:crypto';
import { Database, Row } from './Database';
import { Account } from '../entity/Account';
import { Session } from '../entity/Session';
import { Uuid } from '../entity/valueTypes';
import { Role } from '../entity/enums';
import { AccountStore, SessionStore } from '../ports/Stores';

const COLUMNS = `
  id, email, auth_user_id, email_verified, role, is_active, telegram_chat_id,
  failed_attempts, first_failure_at, locked_until, created_at`;

export class AccountRepository implements AccountStore {
  constructor(private readonly db: Database) {}

  async findById(id: Uuid): Promise<Account | null> {
    const rows = await this.db.query(`SELECT ${COLUMNS} FROM account WHERE id = $1`, [id]);
    return rows.length === 0 ? null : AccountRepository.toAccount(rows[0] as Row);
  }

  /** 2.1.4 — the duplicate-registration check, and the lookup sign-in starts from. */
  async findByEmail(email: string): Promise<Account | null> {
    const rows = await this.db.query(`SELECT ${COLUMNS} FROM account WHERE email = $1`, [email]);
    return rows.length === 0 ? null : AccountRepository.toAccount(rows[0] as Row);
  }

  /**
   * The provider's id, not ours. Empty is not a match: `auth_user_id` defaults to `''` in the
   * schema, so a lookup on the empty string would return whichever unlinked account came first.
   */
  async findByAuthUserId(authUserId: string): Promise<Account | null> {
    if (authUserId === '') {
      return null;
    }
    const rows = await this.db.query(`SELECT ${COLUMNS} FROM account WHERE auth_user_id = $1`, [authUserId]);
    return rows.length === 0 ? null : AccountRepository.toAccount(rows[0] as Row);
  }

  async save(account: Account): Promise<Account> {
    account.id = account.id || randomUUID();
    const lock = account.lockState();
    await this.db.query(
      `INSERT INTO account (
         id, email, auth_user_id, email_verified, role, is_active, telegram_chat_id,
         failed_attempts, first_failure_at, locked_until, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         email            = EXCLUDED.email,
         auth_user_id     = EXCLUDED.auth_user_id,
         email_verified   = EXCLUDED.email_verified,
         role             = EXCLUDED.role,
         is_active        = EXCLUDED.is_active,
         telegram_chat_id = EXCLUDED.telegram_chat_id,
         failed_attempts  = EXCLUDED.failed_attempts,
         first_failure_at = EXCLUDED.first_failure_at,
         locked_until     = EXCLUDED.locked_until`,
      [
        account.id,
        account.email,
        account.authUserId,
        account.emailVerified,
        account.role,
        account.isActive,
        account.telegramChatId,
        lock.failedAttempts,
        lock.firstFailureAt,
        lock.lockedUntil,
        account.createdAt,
      ],
    );
    return account;
  }

  /** 2.2.3, 2.2.4 — the staff list a manager provisions from, and the crew list assignment reads. */
  async findByRole(role: Role): Promise<Account[]> {
    const rows = await this.db.query(`SELECT ${COLUMNS} FROM account WHERE role = $1 ORDER BY email`, [role]);
    return rows.map((r) => AccountRepository.toAccount(r));
  }

  private static toAccount(row: Row): Account {
    const account = new Account();
    account.id = row.id as Uuid;
    account.email = row.email as string;
    account.authUserId = row.auth_user_id as string;
    account.emailVerified = row.email_verified === true;
    account.role = row.role as Role;
    account.isActive = row.is_active === true;
    account.telegramChatId = (row.telegram_chat_id as string | null) ?? null;
    account.createdAt = row.created_at as Date;
    account.restoreLockState({
      failedAttempts: Number(row.failed_attempts),
      firstFailureAt: (row.first_failure_at as Date | null) ?? null,
      lockedUntil: (row.locked_until as Date | null) ?? null,
    });
    return account;
  }
}

/**
 * 2.1.8, 2.1.9, 2.1.12. Ours rather than the provider's, because 2.1.9 is an inactivity timeout
 * measured against **our** requests.
 *
 * Every request resolves a principal, so `findByToken` is the hottest query in the system; it is
 * served by the unique index on `token`. `save` upserts on the id and not on the token, because a
 * `touch` must update the row the session already has rather than insert a second one.
 */
export class SessionRepository implements SessionStore {
  constructor(private readonly db: Database) {}

  async findByToken(token: string): Promise<Session | null> {
    const rows = await this.db.query(
      `SELECT id, account_id, token, issued_at, last_active_at, terminated_at
         FROM session WHERE token = $1`,
      [token],
    );
    if (rows.length === 0) {
      return null;
    }
    const row = rows[0] as Row;
    const session = new Session();
    session.id = row.id as Uuid;
    session.accountId = row.account_id as Uuid;
    session.token = row.token as string;
    session.issuedAt = row.issued_at as Date;
    session.lastActiveAt = row.last_active_at as Date;
    session.terminatedAt = (row.terminated_at as Date | null) ?? null;
    return session;
  }

  async save(session: Session): Promise<Session> {
    session.id = session.id || randomUUID();
    await this.db.query(
      `INSERT INTO session (id, account_id, token, issued_at, last_active_at, terminated_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET
         last_active_at = EXCLUDED.last_active_at,
         terminated_at  = EXCLUDED.terminated_at`,
      [session.id, session.accountId, session.token, session.issuedAt, session.lastActiveAt, session.terminatedAt],
    );
    return session;
  }

  /** 2.2.4 — deactivating an account must not leave a live session behind it. */
  async terminateAllFor(accountId: Uuid, at: Date): Promise<number> {
    const rows = await this.db.query(
      `UPDATE session SET terminated_at = $2
        WHERE account_id = $1 AND terminated_at IS NULL
        RETURNING id`,
      [accountId, at],
    );
    return rows.length;
  }
}
