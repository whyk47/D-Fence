/**
 * D-Fence — the session token across a page load.
 * Stereotype: <<boundary>>. Traces: 2.1.8, 2.1.9, 2.1.12, 10.5.6, 11.1.10.
 *
 * The token used to live in a React `useState` and nowhere else, and the comment that put it there
 * cited 2.1.8. Reading 2.1.8 again, it says only that a token is *issued*; it says nothing about
 * where the client keeps it. The requirement that actually bears on this is **2.1.9**, which gives
 * a session twenty-four hours of inactivity before it expires — and a session that dies when the
 * user presses F5 cannot express a twenty-four hour window at all. So the in-memory-only choice
 * was not implementing 2.1.8, it was quietly contradicting 2.1.9.
 *
 * **What is stored is the token and nothing else.** Not the role, not the account id. Those come
 * back from `GET /api/auth/me` on every restore, because a role read out of `localStorage` is a
 * role the user can edit with the developer console, and a client that trusts it has moved an
 * access decision off the server in violation of 2.3.6. Restoring costs one round trip; the
 * alternative costs the guard its meaning.
 *
 * The restore is therefore a *server* operation: the token is a claim, and `/api/auth/me` is what
 * adjudicates it. An expired token (2.1.9), a signed-out token (2.1.12) and a token from a
 * database that has since been reseeded all fail the same way and are all cleared the same way.
 *
 * `localStorage` and not `sessionStorage`: 2.1.9's twenty-four hours outlive a tab, and a
 * `sessionStorage` token would be dropped by the browser well before the server dropped the
 * session — the client would sign the user out on a schedule the requirement does not describe.
 */
import { ApiClient } from './ApiClient';
import { Role } from '../../../src/entity/enums';
import { ClientPrincipal } from '../app/RouteGuard';

/** Namespaced, because a browser profile holds one origin's worth of keys for every app on it. */
export const SESSION_KEY = 'd-fence.session.token';

/**
 * The subset of `Storage` this needs.
 *
 * Declared rather than using `Storage` so the tests can pass a plain object, and — more to the
 * point — so the calling code cannot reach `clear()` and wipe keys that are not ours.
 */
export interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The browser's `localStorage`, or `null` where there isn't one.
 *
 * Both the `typeof` check and the try/catch are load-bearing and neither replaces the other. The
 * check covers server-side rendering and the test runner's default environment, where the global
 * is simply absent. The catch covers Safari in Private Browsing and a Chrome profile with
 * third-party storage blocked, where the global *exists* and throws `SecurityError` on first
 * touch. Without the catch the application would fail to mount for those users rather than merely
 * failing to remember them.
 */
export function browserStorage(): TokenStorage | null {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    // Touched deliberately: the throw happens on access, not on the `typeof`.
    localStorage.getItem(SESSION_KEY);
    return localStorage;
  } catch {
    return null;
  }
}

/** 2.1.8 — remember the issued token. A null token forgets it, which is what 2.1.12 wants. */
export function rememberToken(storage: TokenStorage | null, token: string | null): void {
  if (storage === null) {
    return;
  }
  try {
    if (token === null) {
      storage.removeItem(SESSION_KEY);
    } else {
      storage.setItem(SESSION_KEY, token);
    }
  } catch {
    // A full or read-only quota. The session still works for this page load; it just will not
    // survive the next one, which is exactly the behaviour that existed before this file.
  }
}

export function storedToken(storage: TokenStorage | null): string | null {
  if (storage === null) {
    return null;
  }
  try {
    const value = storage.getItem(SESSION_KEY);
    return value === null || value === '' ? null : value;
  } catch {
    return null;
  }
}

/** What `GET /api/auth/me` answers with. */
interface MeResponse {
  accountId?: string;
  role?: string;
  sessionId?: string;
}

export type RestoreOutcome =
  /** No token was stored. Nothing was asked of the server. */
  | { kind: 'none' }
  /** The stored token is live, and this is who it belongs to — per the server, not per the client. */
  | { kind: 'restored'; principal: ClientPrincipal; token: string }
  /** The token was refused (2.1.9 expiry, 2.1.12 sign-out, or a session the server no longer has). */
  | { kind: 'expired' }
  /**
   * The server could not be reached, so the token's status is **unknown**.
   *
   * Deliberately not folded into `expired`. Discarding a good token because the wifi dropped for
   * one request would sign the user out for a reason that has nothing to do with their session,
   * and they would have to find their password to undo it. The token is kept, the user is treated
   * as signed out for this load, and the next load tries again.
   */
  | { kind: 'unreachable' };

/**
 * Turn a stored token back into a principal, or find out that it is no longer one.
 *
 * Called once, before the first render, because the route guard sends a null principal to
 * `/signin` (11.1.10) — so a restore that resolved *after* the first paint would bounce the user
 * off the page they had bookmarked and then leave them signed in on the sign-in screen.
 */
export async function restoreSession(
  api: ApiClient,
  storage: TokenStorage | null,
): Promise<RestoreOutcome> {
  const token = storedToken(storage);
  if (token === null) {
    return { kind: 'none' };
  }

  api.setToken(token);
  let me: MeResponse;
  try {
    me = await api.get<MeResponse>('/api/auth/me');
  } catch (error) {
    // `ApiClient` reports a network failure as status 0 and a refusal as the server's status. The
    // difference is the whole point of `unreachable`, so it is read rather than assumed.
    const status = (error as { failure?: { status?: number } }).failure?.status;
    if (status === 0 || status === undefined) {
      api.setToken(null);
      return { kind: 'unreachable' };
    }
    api.setToken(null);
    rememberToken(storage, null);
    return { kind: 'expired' };
  }

  // A 200 whose body is not a principal is not a restore. This is not defensive noise: a proxy or
  // a captive portal answering 200 with its own HTML is a real thing on hotel and campus wifi,
  // and without this check the user is admitted with `role` undefined and the guard then refuses
  // every screen they own.
  const role = Object.values(Role).find((r) => r === me.role);
  if (role === undefined || me.accountId === undefined || me.accountId === '') {
    api.setToken(null);
    rememberToken(storage, null);
    return { kind: 'expired' };
  }
  return { kind: 'restored', principal: { accountId: me.accountId, role }, token };
}
