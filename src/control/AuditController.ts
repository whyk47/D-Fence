/**
 * D-Fence — reading the audit trail.
 * Stereotype: <<control>>. Traces: 2.3.4, 2.3.8, 2.4.1, 2.4.2, 10.5.3.
 *
 * The trail has been *written* correctly for weeks and could not be *read* at all: there was no
 * route, no controller and, in the deployment, no table row either. A record nobody can read is
 * indistinguishable from a record nobody keeps, and 2.4.1 exists to answer a question — who did
 * this — that only a reader can ask.
 *
 * **Reading is a privilege, and it is audited like everything else.** The trail names every actor
 * and every target in the system, so unrestricted access to it would be a directory of what exists
 * and who touched it — precisely the oracle 2.3.7 refuses to be. 2.3.4 gives operational oversight
 * to the Operations Manager, so `audit:read` goes to that role and no other, and asking for it is
 * itself an auditable action.
 *
 * **This class cannot write.** It holds the store as a reader by taking only what it needs; there
 * is no method here that appends, and no caller of this class can cause an append. 2.4.2's real
 * guarantee is the database trigger, but the shape of this class should not undermine it.
 */
import { AccessControlService } from './AccessControlService';
import { Principal } from './Principal';
import { AuditEntry, AuditStore } from '../ports/Stores';
import { Uuid } from '../entity/valueTypes';

/** A trail entry as a screen wants it: the refusal flag lifted out of the action name. */
export interface AuditView {
  accountId: Uuid;
  action: string;
  /**
   * 2.3.8's refusals are stored with a `DENIED:` prefix so that they cannot be confused with
   * things that happened. Lifted into a boolean here rather than left for the client to parse:
   * a screen that discovers the convention by string-matching is a screen that will get it wrong
   * the day an action name legitimately contains the word.
   */
  refused: boolean;
  targetEntity: string;
  targetId: Uuid | null;
  occurredAt: Date;
}

/** How many rows a caller may ask for at once. */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export class AuditController {
  constructor(
    private readonly ac: AccessControlService,
    private readonly audit: AuditStore,
  ) {}

  /** 2.4.1 — the whole trail, newest first. */
  async recent(limit: number | undefined, by: Principal): Promise<AuditView[]> {
    await this.ac.authorise(by, 'audit:read', { kind: 'auditRecord' });
    return (await this.audit.recent(AuditController.bounded(limit))).map(AuditController.view);
  }

  /**
   * 2.4.1, 8.3.x — one entity's history.
   *
   * Takes the entity *kind* as well as the id, because the trail is keyed by both and a bare id
   * would let a caller read a work order's history by asking for a report's. Kinds are checked
   * against a list rather than passed through: `target_entity` reaches a WHERE clause, and an
   * unchecked one is a client choosing what the query means.
   */
  async history(targetEntity: string, targetId: Uuid, limit: number | undefined, by: Principal): Promise<AuditView[]> {
    await this.ac.authorise(by, 'audit:read', { kind: 'auditRecord', id: targetId });
    return (await this.audit.forTarget(targetEntity, targetId, AuditController.bounded(limit))).map(
      AuditController.view,
    );
  }

  /**
   * A limit that cannot be used to ask for the whole table.
   *
   * `?limit=99999999` on an append-only table that only grows is a request that gets slower every
   * day the system runs, and the caller who sends it is rarely the one who meant to.
   */
  private static bounded(limit: number | undefined): number {
    if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
      return DEFAULT_LIMIT;
    }
    return Math.min(Math.floor(limit), MAX_LIMIT);
  }

  private static view(entry: AuditEntry): AuditView {
    const refused = entry.action.startsWith('DENIED:');
    return {
      accountId: entry.accountId,
      action: refused ? entry.action.slice('DENIED:'.length) : entry.action,
      refused,
      targetEntity: entry.targetEntity,
      targetId: entry.targetId,
      occurredAt: entry.occurredAt,
    };
  }
}
