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

/**
 * Actions whose answer is not "may this role" but "may this principal, for this object".
 * 2.3.1 and 2.3.2 are ownership questions; keeping the list here keeps the matrix small.
 */
const OWNERSHIP_SCOPED: ReadonlySet<Action> = new Set([
  'savedLocation:read',
  'savedLocation:write',
  'report:readIdentified',
  'workOrder:readAssigned',
  // 6.1.1 is a preference on *a resident's own* saved location. Added with E6, in this list rather
  // than as a comparison inside AlertPreferenceController, because that is where every other
  // ownership rule already lives — a second mechanism for the same question is how they diverge.
  'alert:configure',
]);

export class AccessPolicy {
  private readonly matrix = new Map<Role, Set<Permission>>([
    // 2.3.1, 2.3.2: own saved locations and own reports. 2.3.3: no dashboard, no work orders.
    [
      Role.Resident,
      new Set<Permission>([
        'cluster:read',
        'savedLocation:read',
        'savedLocation:write',
        'report:create',
        // 5.1.13 — confirming is not creating, and it is deliberately NOT ownership-scoped: the
        // whole point is that a *neighbour* corroborates a report that is not theirs.
        'report:confirm',
        'report:readIdentified',
        'alert:configure',
      ]),
    ],
    // 2.3.4: all reports, scores, work orders and crew records.
    [
      Role.OperationsManager,
      new Set<Permission>([
        'cluster:read',
        'report:readAll',
        'report:moderate',
        'priorityScore:read',
        'workOrder:readAll',
        'workOrder:write',
        'staff:manage',
        'dashboard:read',
        'sourceHealth:read',
        // 1.1.18 — a manual ingestion run spends the department's quota against three public APIs
        // and rewrites the scores every screen reads. 2.3.4 gives it to the manager and nobody else;
        // it is listed here rather than checked inside IngestionController for the same reason as
        // every other role rule.
        'ingestion:trigger',
      ]),
    ],
    // 2.3.5: only work orders assigned to that member — hence workOrder:readAssigned, not readAll.
    [
      Role.CleaningCrew,
      new Set<Permission>(['cluster:read', 'workOrder:readAssigned', 'workOrder:progress']),
    ],
  ]);

  permissionsFor(role: Role): Set<Permission> {
    return this.matrix.get(role) ?? new Set<Permission>();
  }

  /**
   * True for actions where the matrix is not the whole answer. 2.3.1 and 2.3.2 are not
   * "may a Resident read saved locations" but "may this Resident read THIS saved location".
   * Modelling ownership as a property of the action keeps the matrix small and the check in
   * one place.
   */
  isOwnershipScoped(action: Action): boolean {
    return OWNERSHIP_SCOPED.has(action);
  }
}
