/**
 * D-Fence — the route table the application actually serves.
 * Traces: 11.1.1–11.1.8, 11.2.1–11.2.25, 11.3.2, 11.3.8, 2.3.3–2.3.5.
 *
 * This is the list `DialogMap.conformanceProblems` is checked against. It is written by hand rather
 * than generated from the diagram on purpose: generated code cannot disagree with its source, and
 * the disagreement is the thing worth catching.
 */
import { Role } from '../../../src/entity/enums';

export interface RouteDefinition {
  /** Must match a state alias in `lab3/dialog-map-design.puml`. */
  screenId: string;
  /** 11.3.8 — the distinct URL. `:param` segments match one path segment. */
  path: string;
  /** The 11.2.x screen this realises. */
  requirement: string;
  /**
   * Which roles may open it. `null` means public (11.1.9): the four screens an unauthenticated
   * visitor may reach.
   */
  roles: Role[] | null;
  title: string;
}

/**
 * 11.1.9 — the public screens, and only these four. Listed as a constant rather than inferred from
 * `roles: null` so that adding a fifth is a deliberate edit to a named list.
 */
export const PUBLIC_SCREENS = ['Landing', 'Register', 'SignIn', 'ResetRequest'] as const;

export const ROUTES: readonly RouteDefinition[] = [
  { screenId: 'Landing', path: '/', requirement: '11.2.1', roles: null, title: 'D-Fence' },
  { screenId: 'Register', path: '/register', requirement: '11.2.2', roles: null, title: 'Create an account' },
  { screenId: 'SignIn', path: '/signin', requirement: '11.2.3', roles: null, title: 'Sign in' },
  { screenId: 'ResetRequest', path: '/reset', requirement: '11.2.4', roles: null, title: 'Reset your password' },
  // The reset form carries the emailed token, so it is reachable without a session too.
  { screenId: 'ResetForm', path: '/reset/:token', requirement: '11.2.4', roles: null, title: 'Choose a new password' },

  // 2.3.1, 2.3.2 — the resident's own map, locations and reports.
  { screenId: 'ResidentMap', path: '/map', requirement: '11.2.5', roles: [Role.Resident], title: 'Dengue map' },
  { screenId: 'MyLocations', path: '/locations', requirement: '11.2.6', roles: [Role.Resident], title: 'My locations' },
  { screenId: 'AddLocation', path: '/locations/new', requirement: '11.2.7', roles: [Role.Resident], title: 'Add a location' },
  { screenId: 'ReportSite', path: '/report', requirement: '11.2.8', roles: [Role.Resident], title: 'Report a site' },
  { screenId: 'MyReports', path: '/reports', requirement: '11.2.9', roles: [Role.Resident], title: 'My reports' },
  { screenId: 'ReportDetail', path: '/reports/:id', requirement: '11.2.10', roles: [Role.Resident], title: 'Report' },
  { screenId: 'AlertSettings', path: '/alerts', requirement: '11.2.11', roles: [Role.Resident], title: 'Alerts' },

  // 2.3.4 — the manager's screens. 2.3.3 denies every one of them to a Resident.
  { screenId: 'OpsDashboard', path: '/ops', requirement: '11.2.12', roles: [Role.OperationsManager], title: 'Operations' },
  { screenId: 'ClusterDetail', path: '/ops/clusters/:id', requirement: '11.2.13', roles: [Role.OperationsManager], title: 'Cluster' },
  { screenId: 'ModQueue', path: '/ops/moderation', requirement: '11.2.14', roles: [Role.OperationsManager], title: 'Moderation' },
  { screenId: 'ReportReview', path: '/ops/moderation/:id', requirement: '11.2.15', roles: [Role.OperationsManager], title: 'Review report' },
  { screenId: 'DispatchProposal', path: '/ops/dispatch', requirement: '11.2.16', roles: [Role.OperationsManager], title: "Today's dispatch" },
  { screenId: 'WOCreate', path: '/ops/work-orders/new', requirement: '11.2.17', roles: [Role.OperationsManager], title: 'New work order' },
  { screenId: 'WOList', path: '/ops/work-orders', requirement: '11.2.25', roles: [Role.OperationsManager], title: 'Work orders' },
  { screenId: 'WODetail', path: '/ops/work-orders/:id', requirement: '11.2.18', roles: [Role.OperationsManager], title: 'Work order' },
  { screenId: 'StaffAccounts', path: '/ops/staff', requirement: '11.2.22', roles: [Role.OperationsManager], title: 'Staff' },
  { screenId: 'DataSources', path: '/ops/sources', requirement: '11.2.23', roles: [Role.OperationsManager], title: 'Data sources' },
  { screenId: 'Analytics', path: '/ops/analytics', requirement: '11.2.26', roles: [Role.OperationsManager], title: 'Analytics' },

  // 2.3.5 — the crew member's three screens, and nothing else.
  { screenId: 'MyJobs', path: '/crew', requirement: '11.2.19', roles: [Role.CleaningCrew], title: 'My jobs' },
  { screenId: 'JobDetail', path: '/crew/jobs/:id', requirement: '11.2.20', roles: [Role.CleaningCrew], title: 'Job' },
  { screenId: 'JobCompletion', path: '/crew/jobs/:id/complete', requirement: '11.2.21', roles: [Role.CleaningCrew], title: 'Complete job' },

  // 11.2.24 — reachable from anywhere, by anyone, including nobody.
  { screenId: 'NotAuthorised', path: '/403', requirement: '11.2.24', roles: null, title: 'Not authorised' },
  { screenId: 'NotFound', path: '/404', requirement: '11.2.24', roles: null, title: 'Not found' },
];

/** 11.3.8 — the URLs the application serves, for the conformance check. */
export function servedRoutes(): string[] {
  return ROUTES.map((r) => r.path);
}

/**
 * Matches a URL to a route, filling in `:param` segments.
 *
 * Longest literal prefix first, so `/ops/work-orders/new` is not swallowed by
 * `/ops/work-orders/:id`. Ordering the table by hand would work until somebody inserted a row.
 */
export function matchRoute(url: string): { route: RouteDefinition; params: Record<string, string> } | null {
  const path = url.split('?')[0] ?? '/';
  const segments = path.split('/').filter((s) => s !== '');

  const candidates = ROUTES.filter((r) => {
    const routeSegments = r.path.split('/').filter((s) => s !== '');
    return (
      routeSegments.length === segments.length &&
      routeSegments.every((seg, i) => seg.startsWith(':') || seg === segments[i])
    );
  }).sort((a, b) => literalCount(b.path) - literalCount(a.path));

  const route = candidates[0];
  if (route === undefined) {
    return null;
  }
  const params: Record<string, string> = {};
  route.path
    .split('/')
    .filter((s) => s !== '')
    .forEach((seg, i) => {
      if (seg.startsWith(':')) {
        params[seg.slice(1)] = segments[i] as string;
      }
    });
  return { route, params };
}

function literalCount(path: string): number {
  return path.split('/').filter((s) => s !== '' && !s.startsWith(':')).length;
}
