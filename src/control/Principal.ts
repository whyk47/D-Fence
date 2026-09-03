/**
 * D-Fence — the authenticated caller.
 * Traces: 2.2.1, 2.3.x. Not persistent: derived from the session on every request.
 */
import { Role } from '../entity/enums';
import { Uuid } from '../entity/valueTypes';

/**
 * 2.4.1 asks for "the acting user id" on every state change, and some state changes have no user
 * behind them: closing a report because its work order was verified (5.2.7), a scheduled ingestion
 * cycle. Attributing those to whoever happened to trigger the chain would be a lie in the one log
 * that exists to be trusted, and leaving the field blank makes "nobody did this" and "we did not
 * record who did this" indistinguishable. So they are attributed to a named non-user instead.
 */
export const SYSTEM_ACTOR_ID = 'system';

export class Principal {
  constructor(
    readonly accountId: Uuid,
    readonly role: Role,
    readonly sessionId: Uuid,
  ) {}
}
