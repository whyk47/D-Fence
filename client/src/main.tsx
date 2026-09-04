/**
 * D-Fence — the client's entry point.
 * Stereotype: <<boundary>>. Traces: 11.1.1–11.1.10, 11.3.2, 2.1.8, 2.3.6, 2.3.7.
 *
 * Everything else in `client/` was compiled and unit-tested but never **run**: there was no
 * `index.html`, no bundle and no mount, so twenty-seven screens existed and nothing served them.
 * This file is the whole of what was missing, and it is deliberately small — it owns the three
 * pieces of state a single-page application cannot avoid and nothing else.
 *
 * 1. **The URL**, mirrored into React state and kept in step with the browser's history. The back
 *    button has to work, and it only does if every navigation goes through `pushState` and every
 *    `popstate` comes back into the same state.
 * 2. **The principal**, which is who is signed in. It lives in memory only (2.1.8) — deliberately
 *    not in `localStorage`, where a token survives the tab and outlives the session the server
 *    thinks it ended.
 * 3. **One `ApiClient`**, constructed once and given the 403 handler, so that a refusal anywhere in
 *    the application lands on Not Authorised without every screen remembering to check.
 *
 * The router is the route table plus the guard, both of which already existed and are already
 * checked against the dialog map. Nothing here decides what a role may see: the guard is a
 * convenience, 2.3.6 is enforced on the server, and a 403 still arrives and is still shown.
 */
import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './app/AppShell';
import { ClientPrincipal } from './app/RouteGuard';
import { renderScreen, screensWithoutComponent } from './app/ScreenRegistry';
import { ApiClient } from './lib/ApiClient';

function App(): JSX.Element {
  const [url, setUrl] = useState(() => window.location.pathname + window.location.search);
  const [principal, setPrincipal] = useState<ClientPrincipal | null>(null);
  const [token, setToken] = useState<string | null>(null);

  /**
   * One client for the life of the application.
   *
   * `useMemo` with an empty dependency list rather than a module-level constant: the 403 handler
   * has to reach `setUrl`, and a module-level instance would need a mutable hook-out that every
   * test would then have to reset. The token is applied separately below, so a sign-in does not
   * rebuild the client and cancel whatever it was doing.
   */
  const api = useMemo(
    () =>
      new ApiClient('', globalThis.fetch.bind(globalThis), () => {
        // 11.2.24 — the server refused; the client shows the refusal rather than inventing one.
        window.history.pushState({}, '', '/not-authorised');
        setUrl('/not-authorised');
      }),
    [],
  );

  useEffect(() => {
    api.setToken(token);
  }, [api, token]);

  /** The only way the URL changes. 11.3.2 stays checkable because there is one door. */
  const navigate = useCallback((next: string) => {
    // Guarded, or a screen that navigates to where it already is pushes a duplicate history entry
    // and the back button appears to do nothing.
    if (next !== window.location.pathname + window.location.search) {
      window.history.pushState({}, '', next);
    }
    setUrl(next);
  }, []);

  useEffect(() => {
    const onPopState = (): void => setUrl(window.location.pathname + window.location.search);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const onPrincipalChange = useCallback(
    (next: ClientPrincipal | null, nextToken: string | null) => {
      setPrincipal(next);
      setToken(nextToken);
    },
    [],
  );

  /**
   * 2.1.12 — sign-out tells the server first, then forgets locally.
   *
   * The order matters and the `catch` is deliberate: if the call fails the local session is still
   * dropped, because a user who pressed Sign out and stayed signed in is the worse outcome. The
   * server's own inactivity timeout (2.1.9) closes the orphan.
   */
  const onSignOut = useCallback(() => {
    void api
      .post('/api/auth/signout', {})
      .catch(() => undefined)
      .finally(() => {
        setPrincipal(null);
        setToken(null);
        navigate('/');
      });
  }, [api, navigate]);

  return (
    <AppShell
      url={url}
      principal={principal}
      onNavigate={navigate}
      onSignOut={onSignOut}
      renderScreen={renderScreen({ api, principal, onNavigate: navigate, onPrincipalChange })}
    />
  );
}

/**
 * 11.3.1 — a route with no component renders as a blank page, and a blank page is a promise the
 * software does not keep. The test suite fails on this, and it is checked again at start-up because
 * the two can only disagree if someone shipped without running the tests, which is exactly when it
 * matters.
 */
const missing = screensWithoutComponent();
if (missing.length > 0) {
  console.error(`Routes with no screen component: ${missing.join(', ')}`);
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('no #root element; index.html and main.tsx disagree');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
