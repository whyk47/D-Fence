/**
 * D-Fence — Lab 4: the session survives a page load (§2.1.8, 2.1.9, 2.1.12, 2.3.6).
 *
 * The defect under test was reported by the independent review as "refreshing the page signs you
 * out", and it was true: `localStorage`, `sessionStorage` and `document.cookie` appeared zero
 * times in the shipped bundle. What makes it worth a test file of its own is that the naive fix —
 * write the whole principal to `localStorage` and read it back — trades a usability defect for an
 * access-control one, because the role would then arrive from somewhere the user can edit. So
 * these tests assert two things at once: that the session comes back, and that **the server is
 * what says who it belongs to**.
 *
 * `ApiClient` is given a stub `Fetcher` rather than being mocked, so the bearer header the restore
 * depends on is really constructed and really inspected below.
 */
import { describe, expect, it } from 'vitest';
import { ApiClient, Fetcher } from '../client/src/lib/ApiClient';
import {
  SESSION_KEY,
  TokenStorage,
  browserStorage,
  rememberToken,
  restoreSession,
  storedToken,
} from '../client/src/lib/SessionPersistence';
import { Role } from '../src/entity/enums';

/** A `localStorage` that lives in a Map, so the assertions can read what was actually written. */
function memoryStorage(
  seed: Record<string, string> = {},
): TokenStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function responder(status: number, body: unknown): { fetcher: Fetcher; calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  const fetcher: Fetcher = (_url, init) => {
    calls.push(init ?? {});
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response);
  };
  return { fetcher, calls };
}

describe('Session persistence — §2.1.8, 2.1.9, 2.1.12', () => {
  it('S1 — with nothing stored, nothing is asked of the server', async () => {
    const { fetcher, calls } = responder(200, {});
    const outcome = await restoreSession(new ApiClient('', fetcher), memoryStorage());
    expect(outcome.kind).toBe('none');
    // A signed-out visitor should not pay a round trip to be told they are signed out.
    expect(calls).toHaveLength(0);
  });

  it('S2 — a live token comes back as a principal, and the bearer header carried it', async () => {
    const { fetcher, calls } = responder(200, {
      accountId: 'acc-7',
      role: Role.OperationsManager,
      sessionId: 'sess-1',
    });
    const storage = memoryStorage({ [SESSION_KEY]: 'tok-abc' });
    const outcome = await restoreSession(new ApiClient('', fetcher), storage);

    expect(outcome).toEqual({
      kind: 'restored',
      token: 'tok-abc',
      principal: { accountId: 'acc-7', role: Role.OperationsManager },
    });
    expect((calls[0]?.headers as Record<string, string>).Authorization).toBe('Bearer tok-abc');
    expect(storage.map.get(SESSION_KEY)).toBe('tok-abc');
  });

  it('S3 — the role is the server answer, never the stored value (2.3.6)', async () => {
    // The user has hand-edited storage to claim a manager session. The only thing read back is the
    // token; the role in the response is what decides, and here the server says Resident.
    const storage = memoryStorage({
      [SESSION_KEY]: 'tok-abc',
      'd-fence.session.role': Role.OperationsManager,
    });
    const { fetcher } = responder(200, { accountId: 'acc-7', role: Role.Resident });
    const outcome = await restoreSession(new ApiClient('', fetcher), storage);

    expect(outcome.kind).toBe('restored');
    expect(outcome.kind === 'restored' && outcome.principal.role).toBe(Role.Resident);
  });

  it('S4 — an expired or signed-out token is refused and discarded (2.1.9, 2.1.12)', async () => {
    const storage = memoryStorage({ [SESSION_KEY]: 'stale' });
    const { fetcher } = responder(401, {
      error: 'the session has expired',
      remedy: 'sign in again',
    });
    const outcome = await restoreSession(new ApiClient('', fetcher), storage);

    expect(outcome.kind).toBe('expired');
    // Kept, it would be retried on every load forever and 401 on every one of them.
    expect(storage.map.has(SESSION_KEY)).toBe(false);
  });

  it('S5 — an unreachable server does NOT throw the token away', async () => {
    const storage = memoryStorage({ [SESSION_KEY]: 'tok-abc' });
    const fetcher: Fetcher = () => Promise.reject(new Error('ECONNREFUSED'));
    const outcome = await restoreSession(new ApiClient('', fetcher), storage);

    expect(outcome.kind).toBe('unreachable');
    // The distinction this file exists for: a dropped connection is not evidence about a session,
    // and signing the user out over it would make them find their password to undo a network blip.
    expect(storage.map.get(SESSION_KEY)).toBe('tok-abc');
  });

  it('S6 — a 200 that is not a principal is treated as no session', async () => {
    // What a captive portal or an over-eager proxy actually returns.
    const storage = memoryStorage({ [SESSION_KEY]: 'tok-abc' });
    const { fetcher } = responder(200, { message: 'sign in to the campus network' });
    const outcome = await restoreSession(new ApiClient('', fetcher), storage);

    expect(outcome.kind).toBe('expired');
    expect(storage.map.has(SESSION_KEY)).toBe(false);
  });

  it('S7 — an unknown role string is refused rather than admitted (2.3.6)', async () => {
    const storage = memoryStorage({ [SESSION_KEY]: 'tok-abc' });
    const { fetcher } = responder(200, { accountId: 'acc-7', role: 'Administrator' });
    expect((await restoreSession(new ApiClient('', fetcher), storage)).kind).toBe('expired');
  });

  it('S8 — signing out forgets the token (2.1.12), signing in writes it (2.1.8)', () => {
    const storage = memoryStorage();
    rememberToken(storage, 'tok-abc');
    expect(storedToken(storage)).toBe('tok-abc');
    rememberToken(storage, null);
    expect(storedToken(storage)).toBeNull();
    expect(storage.map.has(SESSION_KEY)).toBe(false);
  });

  it('S9 — a storage that throws degrades to no persistence, not to no application', () => {
    const hostile: TokenStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    // Safari in Private Browsing. None of these may propagate: the page still has to mount.
    expect(() => rememberToken(hostile, 'tok-abc')).not.toThrow();
    expect(() => rememberToken(hostile, null)).not.toThrow();
    expect(storedToken(hostile)).toBeNull();
  });

  it('S10 — no storage at all is a supported configuration', async () => {
    // Server-side rendering and the default test environment both have no `localStorage`.
    expect(browserStorage()).toBeNull();
    rememberToken(null, 'tok-abc');
    expect(storedToken(null)).toBeNull();
    const { fetcher, calls } = responder(200, {});
    expect((await restoreSession(new ApiClient('', fetcher), null)).kind).toBe('none');
    expect(calls).toHaveLength(0);
  });

  it('S11 — an empty stored value is not a token', () => {
    expect(storedToken(memoryStorage({ [SESSION_KEY]: '' }))).toBeNull();
  });
});
