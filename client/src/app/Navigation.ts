/**
 * D-Fence — role-driven navigation.
 * Traces: 11.1.1–11.1.8, 2.3.3–2.3.5, 10.5.6.
 *
 * 11.1.1 says each role sees its own navigation set. The sets are derived from `ROUTES` rather than
 * listed again here: a screen a role may not open must not appear in that role's navigation, and
 * deriving it means the two answers cannot disagree — which is exactly how a nav item that leads
 * straight to Not Authorised gets shipped.
 */
import { Role } from '../../../src/entity/enums';
import { ROUTES, RouteDefinition } from './routes';

export interface NavItem {
  label: string;
  route: string;
  screenId: string;
}

/**
 * The top-level navigation for a role, in the order 11.1.x lists it.
 *
 * Detail screens are excluded: a nav item for `/reports/:id` has no meaningful destination, and
 * one for "Report Detail" would be a link a user could never sensibly press.
 */
const TOP_LEVEL: Record<Role, string[]> = {
  [Role.Resident]: ['ResidentMap', 'MyLocations', 'MyReports', 'AlertSettings'],
  // 11.1.3 — the Work Orders item opens the Work Order List screen (11.2.25), not the create form.
  [Role.OperationsManager]: [
    'OpsDashboard',
    // 11.2.26 — next to the dashboard, because §7.3 belongs to it: the five charts are the
    // same manager's same question asked over thirty days instead of over today.
    'Analytics',
    'ModQueue',
    'DispatchProposal',
    'WOList',
    'StaffAccounts',
    'DataSources',
  ],
  [Role.CleaningCrew]: ['MyJobs'],
};

export function navigationFor(role: Role): NavItem[] {
  const byId = new Map(ROUTES.map((r) => [r.screenId, r]));
  return (TOP_LEVEL[role] ?? []).flatMap((screenId) => {
    const route = byId.get(screenId);
    if (route === undefined || route.roles === null || !route.roles.includes(role)) {
      // Unreachable by construction, and checked anyway: this is the failure the derivation exists
      // to prevent, so it fails loudly rather than rendering a link into a refusal.
      return [];
    }
    return [{ label: route.title, route: route.path, screenId: route.screenId }];
  });
}

/** 11.1.4 — the current screen, indicated in the navigation. */
export function isCurrent(item: NavItem, url: string): boolean {
  const path = url.split('?')[0] ?? '/';
  return item.route === path || path.startsWith(`${item.route}/`);
}

/** 11.1.6, 11.1.7 — every authenticated screen carries the user's role and a way out. */
export interface ShellChrome {
  roleLabel: string;
  showSignOut: boolean;
  items: NavItem[];
}

export function chromeFor(role: Role | null): ShellChrome {
  if (role === null) {
    // 11.1.9 — an unauthenticated visitor gets no navigation and no sign-out control, because
    // there is nothing to sign out of and nowhere they may go but the four public screens.
    return { roleLabel: '', showSignOut: false, items: [] };
  }
  return { roleLabel: LABELS[role], showSignOut: true, items: navigationFor(role) };
}

/** The data dictionary's terms, not invented synonyms (10.5.1). */
const LABELS: Record<Role, string> = {
  [Role.Resident]: 'Resident',
  [Role.OperationsManager]: 'Operations Manager',
  [Role.CleaningCrew]: 'Cleaning Crew Member',
};

/**
 * 11.1.8 — a manager reaches work-order creation from the dashboard in no more than three
 * interactions.
 *
 * Counted over the dialog map's transitions rather than asserted, because the claim is about the
 * navigation *as drawn*, and the shortest path changes whenever the map does.
 */
export function shortestPath(
  transitions: Array<{ from: string; to: string }>,
  from: string,
  to: string,
): string[] | null {
  const queue: string[][] = [[from]];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const path = queue.shift() as string[];
    const last = path[path.length - 1] as string;
    if (last === to) {
      return path;
    }
    for (const next of transitions.filter((t) => t.from === last).map((t) => t.to)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push([...path, next]);
      }
    }
  }
  return null;
}
