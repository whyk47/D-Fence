/**
 * D-Fence — CredentialRepository.
 * Stereotype: <<persistence>>. Traces: 2.1.4, 2.1.5, 2.1.7, 2.1.11, 2.2.5, 10.2.3, 10.3.1.
 *
 * The Postgres half of `CredentialStore`. It holds exactly what the three in-process Maps held —
 * a salted scrypt hash per user and two kinds of single-use token — and nothing more; the rules
 * about them stay in `LocalAuthProvider`, which is the only class that hashes, compares or decides
 * what "expired" means.
 *
 * **`bytea` in and `Buffer` out, with no encoding in between.** `pg` returns a `bytea` as a
 * `Buffer` already, so the salt and the hash never pass through a string. That matters more than
 * it looks: a hash round-tripped through `toString()` and back under the wrong encoding compares
 * unequal to itself, and the symptom is "the password I just set does not work" — a bug that would
 * be blamed on the hashing rather than on the storage.
 *
 * See migration 004 for why these tables exist and why they are expected to be dropped when
 * Supabase Auth is bound.
 */
import { Database, Row } from './Database';
import { AuthUserId } from '../ports/AuthProvider';
import { CredentialRecord, CredentialStore, IssuedToken } from '../ports/CredentialStore';

export class CredentialRepository implements CredentialStore {
  constructor(private readonly db: Database) {}

  async findByEmail(email: string): Promise<CredentialRecord | null> {
    const rows = await this.db.query(
      `SELECT auth_user_id, email, salt, password_hash, disabled
         FROM local_credential WHERE email = $1`,
      [email],
    );
    return rows.length === 0 ? null : CredentialRepository.toRecord(rows[0] as Row);
  }

  async findById(authUserId: AuthUserId): Promise<CredentialRecord | null> {
    const rows = await this.db.query(
      `SELECT auth_user_id, email, salt, password_hash, disabled
         FROM local_credential WHERE auth_user_id = $1`,
      [authUserId],
    );
    return rows.length === 0 ? null : CredentialRepository.toRecord(rows[0] as Row);
  }

  /**
   * Insert, not upsert.
   *
   * 2.1.4 is one account per address, and the provider checks for a duplicate before calling this.
   * An `ON CONFLICT DO UPDATE` here would turn a race between two registrations of the same email
   * into a silent password change on the first one — the check-then-act gap closed in the wrong
   * direction. The UNIQUE constraint raising is the correct outcome.
   */
  async insert(record: CredentialRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO local_credential (auth_user_id, email, salt, password_hash, disabled)
       VALUES ($1, $2, $3, $4, $5)`,
      [record.authUserId, record.email, record.salt, record.hash, record.disabled],
    );
  }

  /** 2.1.11 — the salt is replaced along with the hash, never the hash alone. */
  async updateSecret(authUserId: AuthUserId, salt: Buffer, hash: Buffer): Promise<void> {
    await this.db.query(
      'UPDATE local_credential SET salt = $2, password_hash = $3 WHERE auth_user_id = $1',
      [authUserId, salt, hash],
    );
  }

  async setDisabled(authUserId: AuthUserId, disabled: boolean): Promise<void> {
    await this.db.query('UPDATE local_credential SET disabled = $2 WHERE auth_user_id = $1', [
      authUserId,
      disabled,
    ]);
  }

  /** 10.4.3 — the tokens go with it, by the schema's cascade. */
  async delete(authUserId: AuthUserId): Promise<void> {
    await this.db.query('DELETE FROM local_credential WHERE auth_user_id = $1', [authUserId]);
  }

  /**
   * 2.1.5 — one outstanding verification token per user.
   *
   * Re-registering, or a second `register` call for the same user, replaces the previous token
   * rather than leaving two live. Two valid links for one account means the first one, which may
   * have leaked, still works.
   */
  async putVerification(authUserId: AuthUserId, token: string): Promise<void> {
    await this.db.query(
      "DELETE FROM local_credential_token WHERE auth_user_id = $1 AND kind = 'verification'",
      [authUserId],
    );
    await this.db.query(
      `INSERT INTO local_credential_token (token, auth_user_id, kind, expires_at, used)
       VALUES ($1, $2, 'verification', NULL, false)`,
      [token, authUserId],
    );
  }

  async verificationTokenFor(authUserId: AuthUserId): Promise<string | null> {
    const rows = await this.db.query(
      `SELECT token FROM local_credential_token
        WHERE auth_user_id = $1 AND kind = 'verification' AND NOT used
        ORDER BY issued_at DESC LIMIT 1`,
      [authUserId],
    );
    return rows.length === 0 ? null : String((rows[0] as Row).token);
  }

  /**
   * Single use, enforced by the delete being the read.
   *
   * `DELETE … RETURNING` rather than SELECT-then-DELETE: two requests arriving with the same link
   * would otherwise both find it and both verify. Postgres gives exactly one of them the row.
   */
  async takeVerification(token: string): Promise<AuthUserId | null> {
    const rows = await this.db.query(
      `DELETE FROM local_credential_token
        WHERE token = $1 AND kind = 'verification'
        RETURNING auth_user_id`,
      [token],
    );
    return rows.length === 0 ? null : String((rows[0] as Row).auth_user_id);
  }

  async putReset(token: string, authUserId: AuthUserId, expiresAt: Date): Promise<void> {
    await this.db.query(
      `INSERT INTO local_credential_token (token, auth_user_id, kind, expires_at, used)
       VALUES ($1, $2, 'reset', $3, false)`,
      [token, authUserId, expiresAt],
    );
  }

  /**
   * A spent reset token is kept, not deleted.
   *
   * 2.1.11 makes the link single use, and "already used" must stay distinguishable from "never
   * existed" — otherwise a user who clicks an old link twice gets the same answer as someone
   * guessing tokens, and neither of them learns anything true. The provider decides what to do
   * with `used` and `expiresAt`; this only reports them.
   */
  async findReset(token: string): Promise<IssuedToken | null> {
    const rows = await this.db.query(
      `SELECT auth_user_id, expires_at, used FROM local_credential_token
        WHERE token = $1 AND kind = 'reset'`,
      [token],
    );
    if (rows.length === 0) {
      return null;
    }
    const row = rows[0] as Row;
    return {
      authUserId: String(row.auth_user_id),
      expiresAt: (row.expires_at as Date | null) ?? null,
      used: row.used as boolean,
    };
  }

  async markResetUsed(token: string): Promise<void> {
    await this.db.query(
      "UPDATE local_credential_token SET used = true WHERE token = $1 AND kind = 'reset'",
      [token],
    );
  }

  async latestResetToken(): Promise<string | null> {
    const rows = await this.db.query(
      `SELECT token FROM local_credential_token
        WHERE kind = 'reset' AND NOT used
        ORDER BY issued_at DESC LIMIT 1`,
    );
    return rows.length === 0 ? null : String((rows[0] as Row).token);
  }

  private static toRecord(row: Row): CredentialRecord {
    return {
      authUserId: String(row.auth_user_id),
      email: String(row.email),
      // Already Buffers: `pg` maps `bytea` to `Buffer`, and nothing here re-encodes them.
      salt: row.salt as Buffer,
      hash: row.password_hash as Buffer,
      disabled: row.disabled as boolean,
    };
  }
}
