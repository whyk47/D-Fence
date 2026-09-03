/**
 * D-Fence — the client-side route guard.
 * Traces: 11.1.9, 11.1.10, 10.5.6, 2.3.3–2.3.7.
 *
 * **This guard is a convenience, not a security control.** 2.3.6 requires every access rule to be
 * enforced on the server independently of any interface control, and it is — see
 * `AccessControlService`. What this adds is that a user never lands on a screen they cannot use and
 * then reads an error: 10.5.6 asks for the interface to prevent the dead end, not to be the lock.
 *
 * Stating that plainly matters, because a guard that looks like a security boundary invites the
 * next contributor to skip the server check "since the client already handles it".
 */
import { Role } from '../../../src/entity/enums';
import { matchRoute, RouteDefinition } from './routes';

/** Who is asking, as far as the client knows. Null when nobody is signed in. */
export interface ClientPrincipal {
  accountId: string;
  role: Role;
}

export type GuardDecision =
  | { kind: 'allow'; route: RouteDefinition; params: Record<string, string> }
  /** 11.1.10 — sign in, then continue to where they were going. */
  | { kind: 'redirectToSignIn'; returnTo: string }
  | { kind: 'notAuthorised' }
  | { kind: 'notFound' };

/**
 * 11.1.9, 11.1.10, 10.5.6.
 *
 * The order is deliberate. An unknown URL is Not Found **before** the role is considered, because
 * answering "not authorised" for a path that does not exist tells an anonymous visitor which paths
 * do — the same oracle 2.3.7 refuses to be on the server.
 */
export function guard(url: string, principal: ClientPrincipal | null): GuardDecision {
  const matched = matchRoute(url);
  if (matched === null) {
    return { kind: 'notFound' };
  }
  const { route, params } = matched;

  if (route.roles === null) {
    return { kind: 'allow', route, params }; // 11.1.9 — a public screen
  }
  if (principal === null) {
    // 11.1.10 — remember where they were going, so signing in continues the journey rather than
    // dumping them on a landing page to start again.
    return { kind: 'redirectToSignIn', returnTo: url };
  }
  return route.roles.includes(principal.role)
    ? { kind: 'allow', route, params }
    : { kind: 'notAuthorised' };
}

/**
 * 11.1.10 — where a successful sign-in should land.
 *
 * A `returnTo` the new principal may not open is discarded rather than followed: a crew member who
 * was sent to sign in from a manager's URL should reach their own jobs, not a Not Authorised
 * screen one step after signing in successfully.
 */
export function landingAfterSignIn(role: Role, returnTo: string | null): string {
  if (returnTo !== null) {
    const decision = guard(returnTo, { accountId: '', role });
    if (decision.kind === 'allow') {
      return returnTo;
    }
  }
  return homeFor(role);
}

/** The screen each role starts on, matching the three sign-in transitions on the dialog map. */
export function homeFor(role: Role): string {
  switch (role) {
    case Role.OperationsManager:
      return '/ops';
    case Role.CleaningCrew:
      return '/crew';
    default:
      return '/map';
  }
}
