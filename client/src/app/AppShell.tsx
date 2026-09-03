/**
 * D-Fence — application shell and navigation.
 * Stereotype: <<boundary>>. Traces: 11.1.1–11.1.10, 10.5.1, 10.5.6.
 *
 * The shell owns three things and no more: the chrome around a screen, the guard decision for the
 * current URL, and the sign-out control. It renders **no domain content** — every screen does its
 * own fetching — so that adding a screen never means editing this file.
 */
import { Role } from '../../../src/entity/enums';
import { chromeFor, isCurrent, NavItem, navigationFor } from './Navigation';
import { ClientPrincipal, guard } from './RouteGuard';
import { RouteDefinition } from './routes';

export type { NavItem };
export { navigationFor };

export interface AppShellProps {
  url: string;
  principal: ClientPrincipal | null;
  onNavigate: (url: string) => void;
  onSignOut: () => void;
  /** Supplied by the router: the screen component for the resolved route. */
  renderScreen: (route: RouteDefinition, params: Record<string, string>) => JSX.Element;
}

export function AppShell(props: AppShellProps): JSX.Element {
  const decision = guard(props.url, props.principal);
  const chrome = chromeFor(props.principal?.role ?? null);

  // 11.1.10 — a guard that redirects is not a screen. Rendering the redirect as content would
  // leave the URL saying one thing and the page showing another, which breaks the back button.
  if (decision.kind === 'redirectToSignIn') {
    props.onNavigate(`/signin?returnTo=${encodeURIComponent(decision.returnTo)}`);
    return <main data-screen="Redirecting" />;
  }

  return (
    <div data-component="shell">
      <header>
        <a href="/" data-part="brand">
          D-Fence
        </a>
        <nav aria-label="Main">
          {chrome.items.map((item) => (
            <a
              key={item.screenId}
              href={item.route}
              // 11.1.4 — the current screen is indicated, and `aria-current` says so to a screen
              // reader as well as to the eye. 11.7.5: never colour alone.
              aria-current={isCurrent(item, props.url) ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                props.onNavigate(item.route);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
        {chrome.showSignOut ? (
          <div data-part="account">
            {/* 11.1.6 — the signed-in user's role, in the data dictionary's words. */}
            <span data-part="role">{chrome.roleLabel}</span>
            <button type="button" onClick={props.onSignOut}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      <main>{renderDecision(decision, props)}</main>
    </div>
  );
}

function renderDecision(
  decision: ReturnType<typeof guard>,
  props: AppShellProps,
): JSX.Element {
  switch (decision.kind) {
    case 'allow':
      return props.renderScreen(decision.route, decision.params);
    case 'notAuthorised':
      // 11.2.24, 2.3.7 — no detail about what was refused or whether it exists.
      return (
        <section data-screen="NotAuthorised" data-requirement="11.2.24">
          <h1>Not authorised</h1>
          <p>Your account does not have access to that screen.</p>
          <a href="/">Back to the start</a>
        </section>
      );
    default:
      return (
        <section data-screen="NotFound" data-requirement="11.2.24">
          <h1>Not found</h1>
          <p>That address does not exist.</p>
          <a href="/">Back to the start</a>
        </section>
      );
  }
}

/** 11.1.5 — the roles, for a role switcher in development only. Never a control a user sees. */
export const ALL_ROLES: Role[] = [Role.Resident, Role.OperationsManager, Role.CleaningCrew];
