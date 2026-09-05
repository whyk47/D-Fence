/**
 * D-Fence — AuditRepository.
 * Stereotype: <<persistence>>. Traces: 2.3.8, 2.4.1, 2.4.2, 10.2.3, 10.4.3.
 *
 * §2.4 was the requirement with the widest gap between what the code said and what the deployment
 * did. The control layer has written audit rows correctly for weeks — every refusal through
 * `AccessControlService.denyAndLog`, every status change through the two lifecycle controllers'
 * single write path — and `audit_record` existed in the schema with an append-only trigger on it.
 * But `server.ts` constructed an `InMemoryAuditStore` in production, `AuditRecordRepository.save()`
 * threw `not implemented`, and the table held **zero rows**. Every one of those carefully placed
 * hooks wrote to an array that a container restart discarded, which is not an audit trail; it is
 * an audit trail's shape.
 *
 * **2.4.2 is enforced by the database, not by this class.** There is deliberately no `update` and
 * no `delete` method here, but their absence proves nothing — a future edit could add one. The
 * guarantee is the `audit_record_no_change` trigger in `001_initial_schema.sql`, which raises on
 * any UPDATE or DELETE regardless of who connects or what they intend. This class is written to
 * that contract rather than instead of it: `append` is the only write it performs.
 *
 * **The account id is not a foreign key.** 10.4.3 deletes an account and 2.4.2 says the audit row
 * survives; a cascade would make the second rule false exactly when the first one ran, destroying
 * the row that proves the deletion happened. The id remains as an opaque key to an account that
 * may no longer exist, and a reader is expected to cope with that.
 */
import { Database, Row } from './Database';
import { AuditEntry, AuditStore } from '../ports/Stores';
import { Uuid } from '../entity/valueTypes';

/** Every column, once, so a change to the table is a change in one place. */
const COLUMNS = 'account_id, action, target_entity, target_id, occurred_at';

export class AuditRepository implements AuditStore {
  constructor(private readonly db: Database) {}

  /**
   * 2.3.8 — every refusal is logged, prefixed so that a refusal and a state change are tellable
   * apart when the trail is read. They mean opposite things: one records what happened, the other
   * records what was stopped from happening.
   */
  async appendDenial(accountId: Uuid, action: string, targetEntity: string, targetId: Uuid | null): Promise<void> {
    await this.append(accountId, `DENIED:${action}`, targetEntity, targetId);
  }

  /** 2.4.1 — actor, action, target entity id, timestamp. All four, or it is not the trail. */
  async appendAction(accountId: Uuid, action: string, targetEntity: string, targetId: Uuid | null): Promise<void> {
    await this.append(accountId, action, targetEntity, targetId);
  }

  async recent(limit: number): Promise<AuditEntry[]> {
    const rows = await this.db.query(
      `SELECT ${COLUMNS} FROM audit_record ORDER BY occurred_at DESC, id DESC LIMIT $1`,
      [Math.max(0, limit)],
    );
    return rows.map((row) => AuditRepository.toEntry(row));
  }

  async forTarget(targetEntity: string, targetId: Uuid, limit: number): Promise<AuditEntry[]> {
    const rows = await this.db.query(
      `SELECT ${COLUMNS} FROM audit_record
        WHERE target_entity = $1 AND target_id = $2
        ORDER BY occurred_at DESC, id DESC
        LIMIT $3`,
      [targetEntity, targetId, Math.max(0, limit)],
    );
    return rows.map((row) => AuditRepository.toEntry(row));
  }

  /**
   * The one write.
   *
   * **A failure here is swallowed, and that is a deliberate and uncomfortable choice.** The
   * alternative — letting a logging failure propagate — means a database blip during
   * `denyAndLog` turns a clean 403 into a 500, and a blip during a work-order transition rolls
   * back an action that already succeeded in the caller's mind. Neither is better than a missing
   * row, and both fail *toward* letting the user do something the trail then has no record of.
   * So it is reported loudly to the log with the row's contents, where it can be recovered, rather
   * than thrown.
   *
   * `id DESC` accompanies `occurred_at DESC` in both reads for the reason the in-memory store's
   * comment gives about cycles: two rows written in the same millisecond share a timestamp, and
   * ordering by time alone leaves their relative order to the planner. `bigserial` breaks the tie
   * in insertion order, which is the order the events actually happened in.
   */
  private async append(accountId: Uuid, action: string, targetEntity: string, targetId: Uuid | null): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO audit_record (account_id, action, target_entity, target_id)
         VALUES ($1, $2, $3, $4)`,
        [accountId, action, targetEntity, targetId],
      );
    } catch (error) {
      console.error(
        `[audit] FAILED to record ${action} on ${targetEntity} ${targetId ?? '-'} by ${accountId}: `
          + `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private static toEntry(row: Row): AuditEntry {
    return {
      accountId: String(row.account_id),
      action: String(row.action),
      targetEntity: String(row.target_entity),
      targetId: row.target_id === null ? null : String(row.target_id),
      occurredAt: new Date(String(row.occurred_at)),
    };
  }
}
