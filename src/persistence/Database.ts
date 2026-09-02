/**
 * D-Fence — thin wrapper over the PostgreSQL connection pool.
 * Stereotype: <<infrastructure>>. The only place in the system that knows about SQL clients.
 */
export type Row = Record<string, unknown>;
export type UnitOfWork = (db: Database) => Promise<void>;

export class Database {
  /** Parameterised only. String concatenation into SQL is a 10.3.6 violation. */
  query(_sql: string, _params: unknown[] = []): Promise<Row[]> {
    throw new Error('not implemented');
  }

  /** All-or-nothing. 10.2.4: an external failure must not lose a stored record. */
  transaction(_work: UnitOfWork): Promise<void> {
    throw new Error('not implemented');
  }
}
