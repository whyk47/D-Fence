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
 * 2. **The principal**, which is who is signed in. The *token* is persisted (see
 *    `SessionPersistence`, which explains why 2.1.9 requires it); the *principal* is not, and is
 *    re-fetched from `/api/auth/me` on every load so that a role can never be edited into
 *    existence in the developer console.
 * 3. **One `ApiClient`**, constructed once and given the 403 handler, so that a refusal anywhere in
 *    the application lands on Not Authorised without every screen remembering to check.
 *
 * The router is the route table plus the guard, both of which already existed and are already
 * checked against the dialog map. Nothing here decides what a role may see: the guard is a
 * convenience, 2.3.6 is enforced on the server, and a 403 still arrives and is still shown.
 */
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './app/AppShell';
import { ClientPrincipal } from './app/RouteGuard';
import { renderScreen, screensWithoutComponent } from './app/ScreenRegistry';
import { ApiClient } from './lib/ApiClient';
import { browserStorage, rememberToken, restoreSession } from './lib/SessionPersistence';

function App(): JSX.Element {
  const [url, setUrl] = useState(() => window.location.pathname + window.location.search);
  const [principal, setPrincipal] = useState<ClientPrincipal | null>(null);
  const [token, setToken] = useState<string | null>(null);
  /**
   * True until the stored token has been offered to the server and answered for.
   *
   * Nothing is rendered while it holds, and that is the point rather than a nicety: `guard()`
   * sends a null principal to `/signin` (11.1.10), so painting one frame with the restore still
   * in flight would rewrite the URL and lose the page the user actually asked for — the bookmark
   * would work and then undo itself.
   */
  const [restoring, setRestoring] = useState(true);
  const storage = useMemo(() => browserStorage(), []);

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

  /**
   * 2.1.9 — one restore attempt per page load, before anything is drawn.
   *
   * The ref guards against StrictMode's deliberate double-invocation in development, which would
   * otherwise put two `/api/auth/me` calls on the wire for every refresh.
   */
  const restoreStarted = useRef(false);
  useEffect(() => {
    if (restoreStarted.current) {
      return;
    }
    restoreStarted.current = true;
    void restoreSession(api, storage)
      .then((outcome) => {
        if (outcome.kind === 'restored') {
          setPrincipal(outcome.principal);
          setToken(outcome.token);
        }
        // 'none', 'expired' and 'unreachable' all render as signed out. They differ in what was
        // done to the stored token, and `restoreSession` has already done it.
      })
      .finally(() => setRestoring(false));
  }, [api, storage]);

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
      // 2.1.8 — the one place a token is issued to the client is the one place it is written down.
      rememberToken(storage, nextToken);
    },
    [storage],
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
        // 2.1.12 — and forget it here too, or Sign out would last exactly until the next refresh.
        rememberToken(storage, null);
        navigate('/');
      });
  }, [api, navigate, storage]);

  if (restoring) {
    // 11.4.1 — a load state, not a blank page. `data-state="loading"` is what the client UAT
    // waits on, so the harness cannot mistake this frame for a screen that rendered empty.
    return (
      <main data-screen="Restoring" data-state="loading">
        <p>Restoring your session…</p>
      </main>
    );
  }

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
