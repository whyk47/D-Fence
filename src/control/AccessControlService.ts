/**
 * D-Fence — server-side authorisation.
 * Stereotype: <<control>>. Traces: 2.3.6, 2.3.7, 2.3.8, 10.3.3.
 *
 * Cross-cutting: every route handler calls authorise() before any other control class runs.
 * Row-level security in Postgres is a second layer, not this one — 2.3.6 and 10.3.3 are about
 * the server, so the server is where the answer lives.
 */
import { AuditRecordRepository } from '../persistence/AuditRecordRepository';
import { AccessPolicy, Action, ResourceRef } from './AccessPolicy';
import { Principal } from './Principal';

/** 2.3.7. Carries no detail about the resource: a refusal must not become an oracle. */
export class NotAuthorised extends Error {}

export class AccessControlService {
  constructor(
    private readonly policy: AccessPolicy,
    private readonly audit: AuditRecordRepository,
  ) {}

  /** @throws NotAuthorised — and logs, per 2.3.8, before throwing. */
  authorise(_principal: Principal, _action: Action, _resource: ResourceRef): Promise<void> {
    throw new Error('not implemented');
  }

  may(_principal: Principal, _action: Action, _resource: ResourceRef): Promise<boolean> {
    throw new Error('not implemented');
  }

  /** The only path to a refusal, so 2.3.8's log cannot be skipped by forgetting to call it. */
  private denyAndLog(_principal: Principal, _resource: ResourceRef): Promise<never> {
    throw new Error('not implemented');
  }
}
