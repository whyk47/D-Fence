/**
 * D-Fence — server-side authorisation.
 * Stereotype: <<control>>. Traces: 2.3.1–2.3.8, 10.3.3.
 *
 * Cross-cutting: every route handler calls authorise() before any other control class runs.
 * Row-level security in Postgres is a second layer, not this one — 2.3.6 and 10.3.3 are about
 * the server, so the server is where the answer lives.
 */
import { AuditStore } from '../ports/Stores';
import { AccessPolicy, Action, ResourceRef } from './AccessPolicy';
import { Principal } from './Principal';

/** 2.3.7. Carries no detail about the resource: a refusal must not become an oracle. */
export class NotAuthorised extends Error {
  constructor() {
    super('not authorised');
    this.name = 'NotAuthorised';
  }
}

export class AccessControlService {
  constructor(
    private readonly policy: AccessPolicy,
    private readonly audit: AuditStore,
  ) {}

  /** @throws NotAuthorised — and logs first, per 2.3.8. */
  async authorise(principal: Principal, action: Action, resource: ResourceRef): Promise<void> {
    if (!(await this.may(principal, action, resource))) {
      await this.denyAndLog(principal, action, resource);
    }
  }

  /**
   * 2.3.1–2.3.5 from the matrix, plus the ownership question the matrix cannot answer.
   *
   * The ordering matters: the role check runs **first**, so a Resident asking for another
   * resident's saved location is refused for the same reason as a Resident asking for the
   * dashboard, rather than leaking that the object exists at all.
   */
  async may(principal: Principal, action: Action, resource: ResourceRef): Promise<boolean> {
    if (!this.policy.permissionsFor(principal.role).has(action)) {
      return false;
    }
    if (!this.policy.isOwnershipScoped(action)) {
      return true;
    }
    // 2.3.1, 2.3.2: an ownership-scoped action needs an owner to compare against. A resource that
    // arrives without one is refused rather than allowed — the safe direction when the caller
    // forgot to supply it.
    return resource.ownerId !== undefined && resource.ownerId === principal.accountId;
  }

  /** The only path to a refusal, so 2.3.8's log cannot be skipped by forgetting to call it. */
  private async denyAndLog(principal: Principal, action: Action, resource: ResourceRef): Promise<never> {
    await this.audit.appendDenial(principal.accountId, action, resource.kind, resource.id ?? null);
    throw new NotAuthorised();
  }
}
