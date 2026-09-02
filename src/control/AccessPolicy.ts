/**
 * D-Fence — the role/permission matrix.
 * Traces: 2.3.1-2.3.5.
 *
 * A matrix rather than per-object access control lists, because §2.3 states its rules per role
 * and no requirement gives one object a different rule from its neighbours. See
 * lab3/DESIGN-MODEL.md §3.2 for the full argument.
 */
import { Role } from '../entity/enums';

export type Action = string;
export type Permission = string;
export type ResourceRef = { kind: string; id?: string; ownerId?: string };

export class AccessPolicy {
  private readonly matrix = new Map<Role, Set<Permission>>();

  permissionsFor(_role: Role): Set<Permission> {
    // TODO(F2): 2.3.3 (Resident denied ops dashboard and all work orders),
    // 2.3.4 (Manager reads all), 2.3.5 (Crew reads only their assigned work orders).
    throw new Error('not implemented');
  }

  /**
   * True for actions where the matrix is not the whole answer. 2.3.1 and 2.3.2 are not
   * "may a Resident read saved locations" but "may this Resident read THIS saved location".
   * Modelling ownership as a property of the action keeps the matrix small and the check in
   * one place.
   */
  isOwnershipScoped(_action: Action): boolean {
    throw new Error('not implemented');
  }
}
