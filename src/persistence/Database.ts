/**
 * D-Fence — thin wrapper over the PostgreSQL connection pool.
 * Stereotype: <<infrastructure>>. The only place in the system that knows about SQL clients.
 * Traces: 10.2.4 (an external failure must lose nothing), 10.3.2, 10.3.6, 10.6.2.
 *
 * **TLS is verified, not merely required.** Supabase signs its database certificates with its own
 * private CA (`Supabase Root 2021 CA`, self-signed, valid to 2031), which is not in Node's public
 * bundle — so a naive connection fails with `SELF_SIGNED_CERT_IN_CHAIN` and the usual fix found on
 * the internet is `rejectUnauthorized: false`. That turns a certificate error into no certificate
 * checking at all, on every connection, for ever. Instead the CA is committed to `src/certs/` and
 * passed as the trust anchor, so verification stays on and an actual interception would still fail.
 *
 * The certificate is public — it is a CA certificate, not a key — so committing it is safe and
 * saves every teammate the same afternoon.
 */
import { Pool, PoolClient } from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Row = Record<string, unknown>;
export type UnitOfWork = (db: Database) => Promise<void>;

/** Resolved from this file, not `process.cwd()`: tests and the server run from different places. */
const CA_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'certs', 'prod-ca-2021.crt');

export class Database {
  private pool: Pool | null = null;

  /**
   * @param connectionString the Supabase **session pooler** string. The direct-connection host is
   *   IPv6-only, which fails on most campus and home networks; the transaction pooler (6543) does
   *   not support the session-level features a long-lived server uses.
   */
  constructor(
    private readonly connectionString: string,
    /** Injectable so a test can point at a local Postgres with a different trust anchor. */
    private readonly caPath: string = CA_PATH,
  ) {}

  private connect(): Pool {
    if (this.pool !== null) {
      return this.pool;
    }
    this.pool = new Pool({
      connectionString: this.connectionString,
      ssl: { ca: readFileSync(this.caPath, 'utf8'), rejectUnauthorized: true },
      // The pooler multiplexes; a large client-side pool on top of it buys nothing and burns the
      // project's connection allowance. 10.1.5's fifty concurrent users are served by the pooler.
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    return this.pool;
  }

  /** Parameterised only. String concatenation into SQL is a 10.3.6 violation. */
  async query(sql: string, params: unknown[] = []): Promise<Row[]> {
    const result = await this.connect().query(sql, params);
    return result.rows as Row[];
  }

  /**
   * All-or-nothing. 10.2.4: an external failure must not lose a stored record.
   *
   * The work runs against a `Database` bound to the **transaction's own client**, not to the pool.
   * Handing the caller `this` would let a statement inside the transaction take a different
   * connection out of the pool and commit independently — a bug that shows up as one row of a
   * report saved without its photographs, and only under load.
   */
  async transaction(work: UnitOfWork): Promise<void> {
    const client = await this.connect().connect();
    const scoped = new ScopedDatabase(client);
    try {
      await client.query('BEGIN');
      await work(scoped);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** For the health check and for a clean shutdown. */
  async close(): Promise<void> {
    await this.pool?.end();
    this.pool = null;
  }
}

/** A Database bound to one checked-out client, so everything inside a transaction shares it. */
class ScopedDatabase extends Database {
  constructor(private readonly client: PoolClient) {
    super('');
  }

  override async query(sql: string, params: unknown[] = []): Promise<Row[]> {
    const result = await this.client.query(sql, params);
    return result.rows as Row[];
  }

  /** Nested transactions would need savepoints; nothing needs them, so this refuses rather than
   *  silently flattening two transactions into one. */
  override async transaction(): Promise<void> {
    throw new Error('nested transactions are not supported; use savepoints if this becomes needed');
  }

  override async close(): Promise<void> {
    // The pool owns the client; releasing it is the caller's job in `transaction()`.
  }
}
