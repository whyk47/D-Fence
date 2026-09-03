/**
 * D-Fence — Lab 4 §3.2: the dialog map, the router and the field rules (§11).
 *
 * **This is the suite `lab4/TEST-PLAN.md` §5 said to protect.** 11.3.2 claims no transition exists
 * that is not on the dialog map. That claim is about a PlantUML file and a TypeScript route table
 * agreeing with each other, edited by different people on different days, and the plan's own note
 * said it would be false within a fortnight if left to eyeballing. So it is checked mechanically.
 *
 * The rest of the suite is the two other things in §11 that are logic rather than appearance: which
 * navigation each role sees, and the field rules the mockups cannot change.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseDialogMap,
  conformanceProblems,
  screensWithoutReturnPath,
  duplicateRoutes,
  permits,
} from '../client/src/lib/DialogMap';
import { ROUTES, servedRoutes, matchRoute, PUBLIC_SCREENS } from '../client/src/app/routes';
import { guard, landingAfterSignIn, homeFor } from '../client/src/app/RouteGuard';
import { navigationFor, chromeFor, isCurrent, shortestPath } from '../client/src/app/Navigation';
import {
  evaluate,
  formIsValid,
  hasUnsavedChanges,
  maxLength,
  passwordRules,
  required,
  emailRule,
} from '../client/src/components/FieldValidation';
import { Role } from '../src/entity/enums';

const MAP = parseDialogMap(readFileSync('lab3/dialog-map-design.puml', 'utf8'));

describe('The dialog map is the source of truth — §11.3', () => {
  it('D1 — the map parses into states and transitions', () => {
    expect(MAP.states.length).toBeGreaterThan(20);
    expect(MAP.transitions.length).toBeGreaterThan(30);
    // A parser that silently returned nothing would make every check below pass vacuously.
    expect(MAP.states.find((s) => s.id === 'OpsDashboard')?.route).toBe('/ops');
  });

  it('D2 — every route the application serves is a state on the map, and vice versa (11.3.1, 11.3.2)', () => {
    // The one that catches real drift. Both directions: a screen drawn and never built is a
    // promise in a graded artefact that the software does not keep.
    expect(conformanceProblems(MAP, servedRoutes())).toEqual([]);
  });

  it('D3 — every screen is addressed by a distinct URL (11.3.8)', () => {
    expect(duplicateRoutes(MAP)).toEqual([]);
    expect(new Set(servedRoutes()).size).toBe(servedRoutes().length);
  });

  it('D4 — every screen except Sign In has a return path (11.3.3)', () => {
    // The audit note on the map says four defects of this kind were inherited from Lab 2 and
    // survived a refinement pass. This is the check that would have found them.
    expect(screensWithoutReturnPath(MAP)).toEqual([]);
  });

  it('D5 — every route carries the 11.2.x requirement it realises', () => {
    for (const route of ROUTES) {
      expect(route.requirement).toMatch(/^11\.2\.\d+$/);
    }
  });

  it('D6 — the map permits the demo path and refuses an undrawn one (11.3.2)', () => {
    expect(permits(MAP, 'OpsDashboard', 'ClusterDetail')).toBe(true);
    expect(permits(MAP, 'ClusterDetail', 'WOCreate')).toBe(true);
    // A crew member's job detail is not reachable from the manager's dashboard, by design.
    expect(permits(MAP, 'OpsDashboard', 'JobDetail')).toBe(false);
  });

  it('D7 — a manager reaches work-order creation in no more than three interactions (11.1.8)', () => {
    const path = shortestPath(MAP.transitions, 'OpsDashboard', 'WOCreate');
    expect(path).not.toBeNull();
    // Path length counts states; interactions are the transitions between them.
    expect((path as string[]).length - 1).toBeLessThanOrEqual(3);
  });
});

describe('Route matching — §11.3.8', () => {
  it('R1 — a literal path beats a parameterised one of the same shape', () => {
    // `/ops/work-orders/new` must not be swallowed by `/ops/work-orders/:id`.
    expect(matchRoute('/ops/work-orders/new')?.route.screenId).toBe('WOCreate');
    expect(matchRoute('/ops/work-orders/abc-123')?.route.screenId).toBe('WODetail');
  });

  it('R2 — parameters are extracted by name', () => {
    expect(matchRoute('/reports/r-7')?.params).toEqual({ id: 'r-7' });
    expect(matchRoute('/crew/jobs/w-1/complete')?.params).toEqual({ id: 'w-1' });
  });

  it('R3 — an unknown path matches nothing, and a query string is ignored', () => {
    expect(matchRoute('/nonsense')).toBeNull();
    expect(matchRoute('/ops?tier=High')?.route.screenId).toBe('OpsDashboard');
  });
});

describe('The route guard — §11.1.9, §11.1.10, §2.3.3 to §2.3.5', () => {
  const resident = { accountId: 'r1', role: Role.Resident };
  const manager = { accountId: 'm1', role: Role.OperationsManager };
  const crew = { accountId: 'c1', role: Role.CleaningCrew };

  it('G1 — an unauthenticated visitor reaches exactly the four public screens (11.1.9)', () => {
    const publicRoutes = ROUTES.filter((r) => r.roles === null).map((r) => r.screenId);
    for (const screenId of PUBLIC_SCREENS) {
      expect(publicRoutes).toContain(screenId);
    }
    // The reset form and the two error screens are also role-free; the *four* of 11.1.9 are the
    // entry points, and this states the difference rather than letting the count drift.
    expect(publicRoutes.filter((id) => !['ResetForm', 'NotAuthorised', 'NotFound'].includes(id)).sort()).toEqual(
      [...PUBLIC_SCREENS].sort(),
    );
  });

  it('G2 — a Resident is refused the operations dashboard (2.3.3)', () => {
    expect(guard('/ops', resident).kind).toBe('notAuthorised');
    expect(guard('/ops/work-orders', resident).kind).toBe('notAuthorised');
  });

  it('G3 — a Cleaning Crew member reaches their jobs and nothing else (2.3.5)', () => {
    expect(guard('/crew', crew).kind).toBe('allow');
    expect(guard('/ops', crew).kind).toBe('notAuthorised');
    expect(guard('/map', crew).kind).toBe('notAuthorised');
  });

  it('G4 — an unknown URL is Not Found BEFORE the role is considered (2.3.7)', () => {
    // Answering "not authorised" for a path that does not exist tells an anonymous visitor which
    // paths do — the same oracle the server refuses to be.
    expect(guard('/ops/secret-thing', null).kind).toBe('notFound');
    expect(guard('/ops/secret-thing', resident).kind).toBe('notFound');
  });

  it('G5 — a signed-out visitor is sent to sign in, and remembers where they were going (11.1.10)', () => {
    const decision = guard('/ops/work-orders/w-1', null);
    expect(decision).toEqual({ kind: 'redirectToSignIn', returnTo: '/ops/work-orders/w-1' });
  });

  it('G6 — sign-in returns to the requested screen when the new role may open it (11.1.10)', () => {
    expect(landingAfterSignIn(Role.OperationsManager, '/ops/work-orders')).toBe('/ops/work-orders');
  });

  it('G7 — a returnTo the new role may NOT open is discarded, not followed', () => {
    // Otherwise a crew member is dumped on Not Authorised one step after signing in successfully.
    expect(landingAfterSignIn(Role.CleaningCrew, '/ops/work-orders')).toBe('/crew');
    expect(landingAfterSignIn(Role.Resident, '/nonsense')).toBe('/map');
  });

  it('G8 — each role lands on the screen the map sends it to', () => {
    expect(homeFor(Role.Resident)).toBe('/map');
    expect(homeFor(Role.OperationsManager)).toBe('/ops');
    expect(homeFor(Role.CleaningCrew)).toBe('/crew');
  });
});

describe('Navigation — §11.1.1 to §11.1.7', () => {
  it('N1 — each role sees its own navigation set and nothing more (11.1.1)', () => {
    expect(navigationFor(Role.CleaningCrew).map((i) => i.route)).toEqual(['/crew']);
    expect(navigationFor(Role.Resident).map((i) => i.route)).toEqual([
      '/map',
      '/locations',
      '/reports',
      '/alerts',
    ]);
    expect(navigationFor(Role.OperationsManager).map((i) => i.route)).toContain('/ops/work-orders');
  });

  it('N2 — no navigation item leads to a screen its own role may not open', () => {
    // The failure this derivation exists to prevent: a nav link straight into Not Authorised.
    for (const role of [Role.Resident, Role.OperationsManager, Role.CleaningCrew]) {
      for (const item of navigationFor(role)) {
        expect(guard(item.route, { accountId: 'x', role }).kind).toBe('allow');
      }
    }
  });

  it('N3 — the Work Orders item opens the list, not the create form (11.1.3)', () => {
    const item = navigationFor(Role.OperationsManager).find((i) => i.label === 'Work orders');
    expect(item?.screenId).toBe('WOList');
  });

  it('N4 — the current screen is indicated, including on a detail URL beneath it (11.1.4)', () => {
    const [map] = navigationFor(Role.Resident);
    expect(isCurrent(map as never, '/map')).toBe(true);
    const reports = navigationFor(Role.Resident).find((i) => i.route === '/reports');
    expect(isCurrent(reports as never, '/reports/r-7')).toBe(true);
    expect(isCurrent(reports as never, '/map')).toBe(false);
  });

  it('N5 — an authenticated shell shows the role and a sign-out control (11.1.6, 11.1.7)', () => {
    const chrome = chromeFor(Role.CleaningCrew);
    expect(chrome.showSignOut).toBe(true);
    // The data dictionary's term, not an invented synonym (10.5.1).
    expect(chrome.roleLabel).toBe('Cleaning Crew Member');
  });

  it('N6 — an unauthenticated shell shows neither (11.1.9)', () => {
    expect(chromeFor(null)).toEqual({ roleLabel: '', showSignOut: false, items: [] });
  });
});

describe('Field rules — §11.5', () => {
  it('F1 — a character count is reported against the limit (11.5.2)', () => {
    const field = evaluate('water in a pot', [maxLength(500, '5.1.4')], 500);
    expect(field.count).toEqual({ used: 14, max: 500 });
    expect(field.error).toBeNull();
  });

  it('F2 — the limit is the server\'s, and 501 characters fails it (5.1.4, boundary)', () => {
    expect(evaluate('x'.repeat(500), [maxLength(500, '5.1.4')], 500).error).toBeNull();
    expect(evaluate('x'.repeat(501), [maxLength(500, '5.1.4')], 500).error).toMatch(/limit is 500/);
  });

  it('F3 — the password rules match the server\'s wording (2.1.2, 2.1.3, 10.5.3)', () => {
    expect(evaluate('abc1234', passwordRules()).error).toMatch(/at least 8 characters/);
    expect(evaluate('abcdefgh', passwordRules()).error).toMatch(/one letter and one digit/);
    expect(evaluate('dengue2026', passwordRules()).error).toBeNull();
  });

  it('F4 — only the FIRST failure is shown on a field (11.5.1)', () => {
    // Three messages at once on one field is a wall of red that says less than one sentence does.
    const field = evaluate('', [required('A description'), maxLength(10, '5.1.4')]);
    expect(field.error).toBe('A description is required');
  });

  it('F5 — the email rule is loose on purpose (2.1.1)', () => {
    expect(evaluate('ah.seng+dengue@example.co.uk', [emailRule()]).error).toBeNull();
    expect(evaluate('not-an-address', [emailRule()]).error).toMatch(/valid email/);
  });

  it('F6 — a form is submittable when every field passes (11.5.7)', () => {
    const good = [evaluate('a@b.co', [emailRule()]), evaluate('dengue2026', passwordRules())];
    const bad = [evaluate('nope', [emailRule()]), evaluate('dengue2026', passwordRules())];
    expect(formIsValid(good)).toBe(true);
    expect(formIsValid(bad)).toBe(false);
  });

  it('F7 — unsaved changes are detectable, for the 11.3.6 warning', () => {
    const fields = [evaluate('edited', []), evaluate('same', [])];
    expect(hasUnsavedChanges(fields, ['original', 'same'])).toBe(true);
    expect(hasUnsavedChanges(fields, ['edited', 'same'])).toBe(false);
  });
});
