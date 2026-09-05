/**
 * D-Fence — application shell and navigation.
 * Stereotype: <<boundary>>. Traces: 11.1.1–11.1.10, 10.5.1, 10.5.6.
 *
 * The shell owns three things and no more: the chrome around a screen, the guard decision for the
 * current URL, and the sign-out control. It renders **no domain content** — every screen does its
 * own fetching — so that adding a screen never means editing this file.
 *
 * It also carries the two application-wide mobile affordances (§11.8), for the same reason it
 * carries the navigation: they belong to the application rather than to any screen. The install
 * control appears only while installation is possible and disappears once it has happened; the
 * offline banner appears only while the device says it is offline. Neither is a screen, and
 * neither may push a screen's content down when it is absent — so both render nothing at all
 * rather than an empty element.
 */
import { Role } from '../../../src/entity/enums';
import { NavIcon } from '../components/NavIcon';
import { useInstallPrompt, useOnline } from '../lib/InstallableApp';
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
  const install = useInstallPrompt();
  const online = useOnline();

  // 11.1.10 — a guard that redirects is not a screen. Rendering the redirect as content would
  // leave the URL saying one thing and the page showing another, which breaks the back button.
  if (decision.kind === 'redirectToSignIn') {
    props.onNavigate(`/signin?returnTo=${encodeURIComponent(decision.returnTo)}`);
    return <main data-screen="Redirecting" />;
  }

  /**
   * Which chrome this role gets — the one branch, decided here and drawn entirely by the
   * stylesheet.
   *
   * The Figma screens are not one design: the Operations Manager works at 1440×1024 with a dark
   * rail down the left, while the Resident and the Crew work at 390×844 with a tab bar across the
   * bottom. That is a real difference in the job, not a stylistic one — a manager scans a table of
   * thirty clusters, a crew member holds a phone in one hand in the rain — so the shell honours it.
   *
   * It is an attribute rather than three blocks of JSX because the markup underneath is genuinely
   * the same: a brand, a set of links, an account block. Only the arrangement differs, and
   * arrangement is the stylesheet's job. `data-chrome="bar"` still collapses to the bottom bar
   * under the phone breakpoint, so a manager on a phone is not stranded.
   */
  const chromeKind = chrome.items.length === 0 ? 'none' : props.principal?.role === Role.OperationsManager ? 'rail' : 'bar';

  return (
    <div data-component="shell" data-chrome={chromeKind}>
      <header>
        <div data-part="brand-block">
          <a
            href="/"
            data-part="brand"
            onClick={(event) => {
              event.preventDefault();
              props.onNavigate('/');
            }}
          >
            D-Fence
          </a>
          {/* The rail's second line, naming the workspace rather than repeating the product. */}
          {chrome.showSignOut ? <span data-part="brand-sub">{chrome.roleLabel}</span> : null}
        </div>
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
              <NavIcon screenId={item.screenId} />
              <span data-part="label">{item.label}</span>
            </a>
          ))}
        </nav>
        {/* 11.8.12 — offered only when the browser says installation is possible, which means it
            never appears on a desktop browser that cannot, or inside the installed application. */}
        {install.canInstall ? (
          <button type="button" data-part="install" onClick={() => void install.install()}>
            Install app
          </button>
        ) : null}
        {chrome.showSignOut ? (
          <div data-part="account">
            {/*
              The initials stand in for the avatar the design puts here. The design fills it with a
              person's name; a `ClientPrincipal` carries an account id and a role and nothing else,
              and inventing "Priya Raman" to fill the space would be putting a fiction on a live
              screen. The role's own initials are true and are already the thing 11.1.6 requires be
              shown.
            */}
            <span data-part="avatar" aria-hidden="true">
              {initialsOf(chrome.roleLabel)}
            </span>
            {/* 11.1.6 — the signed-in user's role, in the data dictionary's words. */}
            <span data-part="role">{chrome.roleLabel}</span>
            <button type="button" onClick={props.onSignOut}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      {/* 11.8.9 — stated once, at the top of the application, rather than by each screen guessing.
          `role="status"` and not `role="alert"`: being offline is a condition to be aware of, not
          an error that has just interrupted something. */}
      {online ? null : (
        <p data-part="offline" role="status">
          You are offline. Screens you have already opened still work; new data will arrive when
          you reconnect.
        </p>
      )}

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

/**
 * The first letter of each word of a role label, capped at two — "Operations Manager" is "OM",
 * "Resident" is "R". Decorative only; the label itself is next to it.
 */
function initialsOf(label: string): string {
  return label
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

/** 11.1.5 — the roles, for a role switcher in development only. Never a control a user sees. */
export const ALL_ROLES: Role[] = [Role.Resident, Role.OperationsManager, Role.CleaningCrew];
