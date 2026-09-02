/**
 * D-Fence — the authenticated caller.
 * Traces: 2.2.1, 2.3.x. Not persistent: derived from the session on every request.
 */
import { Role } from '../entity/enums';
import { Uuid } from '../entity/valueTypes';

export class Principal {
  constructor(
    readonly accountId: Uuid,
    readonly role: Role,
    readonly sessionId: Uuid,
  ) {}
}
