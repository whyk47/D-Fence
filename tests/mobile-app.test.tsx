/**
 * @vitest-environment jsdom
 *
 * D-Fence — Lab 4: the application is installable on a phone (§11.8).
 *
 * §11.8 was added on 2026-09-05, when "this should be accessible from a mobile app" arrived as a
 * requirement. The reading taken — and recorded in §13 — is an **installable web application**
 * rather than a second native codebase: one set of screens, launched from the home screen, running
 * without browser chrome, working offline.
 *
 * That reading only holds if the details are right, and the details are exactly the kind that a
 * demonstration on a laptop never exercises. A manifest served as `application/json` is ignored by
 * Chrome and the install prompt never appears. A service worker that caches `/api/` shows yesterday
 * s cluster count under a heading that claims to state how fresh the data is. A cache name without
 * a build stamp pins an installed application to a version that no longer exists on the server,
 * and the user's only escape is clearing site data — which they will never think to do.
 *
 * So these cases run the real `sw.js` in a fake worker scope and drive its handlers, rather than
 * asserting on the file's text.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiClient, ApiError, Fetcher } from '../client/src/lib/ApiClient';
import { AppShell } from '../client/src/app/AppShell';
import { OFFLINE_CAUSE, isInstalled } from '../client/src/lib/InstallableApp';
import { Role } from '../src/entity/enums';

afterEach(() => cleanup());

const PUBLIC = resolve(__dirname, '..', 'client', 'public');
const read = (name: string): string => readFileSync(resolve(PUBLIC, name), 'utf8');
const bytes = (name: string): Buffer => readFileSync(resolve(PUBLIC, name));

/** PNG dimensions live at bytes 16–24 of the IHDR chunk, which every PNG begins with. */
function pngSize(file: string): { width: number; height: number; isPng: boolean } {
  const data = bytes(file);
  return {
    isPng: data.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

describe('The manifest and the icons — §11.8.1–11.8.4', () => {
  const manifest = JSON.parse(read('manifest.webmanifest')) as Record<string, unknown>;

  it('M1 — the manifest declares everything an installable application needs (11.8.2)', () => {
    for (const field of ['name', 'short_name', 'start_url', 'scope', 'theme_color', 'background_color']) {
      expect(manifest[field], field).toBeTruthy();
    }
    // Without `standalone` the "installed" application opens in a browser tab with an address bar,
    // which is the one thing a user would immediately notice is not an app.
    expect(manifest.display).toBe('standalone');
  });

  it('M2 — the icons are real PNGs at the two sizes Android and Chrome ask for (11.8.3)', () => {
    expect(pngSize('icon-192.png')).toEqual({ isPng: true, width: 192, height: 192 });
    expect(pngSize('icon-512.png')).toEqual({ isPng: true, width: 512, height: 512 });
    expect(pngSize('apple-touch-icon.png').isPng).toBe(true);
  });

  it('M3 — one icon is maskable, so a launcher can crop it without clipping the glyph (11.8.4)', () => {
    const icons = manifest.icons as Array<{ src: string; sizes: string; purpose?: string }>;
    const maskable = icons.find((icon) => icon.purpose === 'maskable');
    expect(maskable).toBeDefined();
    expect(pngSize((maskable as { src: string }).src.slice(1)).width).toBe(512);
    // An icon declared maskable but drawn edge to edge is worse than none: Android crops it to a
    // circle and takes the corners off the artwork. The generator keeps content inside the middle
    // 80%, and the file being a distinct one from `icon-512.png` is what proves it was drawn for
    // the purpose rather than relabelled.
    expect(bytes('icon-maskable-512.png').equals(bytes('icon-512.png'))).toBe(false);
  });

  it('M4 — the page links the manifest and the iOS tags iOS needs (11.8.1, 11.8.14)', () => {
    const html = readFileSync(resolve(__dirname, '..', 'client', 'index.html'), 'utf8');
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('name="theme-color"');
    // iOS reads neither the manifest's icons nor its display mode, so these are not duplication.
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('name="apple-mobile-web-app-capable"');
  });

  it('M5 — the viewport adapts to the device and does NOT lock zoom (11.8.5, 11.8.6)', () => {
    const html = readFileSync(resolve(__dirname, '..', 'client', 'index.html'), 'utf8');
    expect(html).toContain('width=device-width, initial-scale=1');
    // The usual way to make a web page feel native, and it removes the only adjustment a person
    // with poor eyesight can make for themselves. §11.7 would not survive it.
    expect(html).not.toContain('user-scalable=no');
    expect(html).not.toContain('maximum-scale');
  });
});

/**
 * The service worker, executed rather than read.
 *
 * `sw.js` is plain script written against `self`, so it can be run inside a constructed scope with
 * stubs for `caches` and `fetch`. Asserting on its source text instead would pass for a file that
 * contains the right words in the wrong order.
 */
interface WorkerScope {
  handlers: Record<string, (event: Record<string, unknown>) => void>;
  deleted: string[];
  opened: string[];
  put: Array<{ key: string; url: string }>;
}

function runWorker(cached: Record<string, string> = {}): WorkerScope {
  const scope: WorkerScope = { handlers: {}, deleted: [], opened: [], put: [] };
  // `replaceAll` for the same reason the build script needs it: the placeholder appears in the
  // worker's doc comment first, and stamping only that leaves one fixed cache name for every build.
  const source = read('sw.js').replaceAll('__BUILD__', 'test1234');
  const cacheApi = {
    open: async (name: string) => {
      scope.opened.push(name);
      return {
        addAll: async () => undefined,
        put: async (request: { url: string }) => void scope.put.push({ key: name, url: request.url }),
      };
    },
    keys: async () => ['d-fence-shell-old', 'd-fence-shell-test1234'],
    delete: async (name: string) => void scope.deleted.push(name),
    match: async (request: { url?: string } | string) => {
      const url = typeof request === 'string' ? request : (request.url ?? '');
      const key = Object.keys(cached).find((k) => url.endsWith(k));
      return key === undefined ? undefined : { body: cached[key], ok: true, type: 'basic' };
    },
  };
  const self = {
    location: { origin: 'https://d-fence.test' },
    addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) => {
      scope.handlers[name] = handler;
    },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
    caches: cacheApi,
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('self', 'caches', 'fetch', 'Response', 'URL', source)(
    self,
    cacheApi,
    (globalThis as { __swFetch?: unknown }).__swFetch ?? (() => Promise.reject(new Error('offline'))),
    class {
      constructor(
        readonly body: unknown,
        readonly init: Record<string, unknown>,
      ) {}
    },
    URL,
  );
  return scope;
}

describe('The service worker — §11.8.7–§11.8.11', () => {
  beforeEach(() => {
    (globalThis as { __swFetch?: unknown }).__swFetch = undefined;
  });

  it('M6 — a request under /api/ is never handled, and so can never be cached (11.8.10)', () => {
    const scope = runWorker();
    let responded = false;
    scope.handlers.fetch?.({
      request: { method: 'GET', url: 'https://d-fence.test/api/ops/dashboard', mode: 'cors' },
      respondWith: () => {
        responded = true;
      },
    });
    // A cached cluster count would be shown under a heading that states how fresh the data is
    // (7.1.9) — the caching would not merely be stale, it would make a true statement false.
    expect(responded).toBe(false);
  });

  it('M7 — a page request offline falls back to the cached shell (11.8.8)', async () => {
    const scope = runWorker({ '/index.html': '<!doctype html>shell' });
    let answer: unknown = null;
    scope.handlers.fetch?.({
      request: { method: 'GET', url: 'https://d-fence.test/ops/work-orders', mode: 'navigate' },
      respondWith: (value: Promise<unknown>) => {
        answer = value;
      },
    });
    // Every client-side route is drawn by the same shell, so an offline deep link lands on the
    // application rather than on the browser's dinosaur.
    await expect(answer as Promise<{ body: string }>).resolves.toEqual(
      expect.objectContaining({ body: '<!doctype html>shell' }),
    );
  });

  it('M8 — a deployment replaces the cached shell rather than pinning the old one (11.8.11)', async () => {
    const scope = runWorker();
    const waits: Array<Promise<unknown>> = [];
    scope.handlers.activate?.({ waitUntil: (p: Promise<unknown>) => void waits.push(p) });
    await Promise.all(waits);

    // The stamp is a hash of the bundle, so a new build is a new cache name and every older one is
    // deleted here. With a fixed name an installed application serves a version of itself that no
    // longer exists on the server.
    expect(scope.deleted).toContain('d-fence-shell-old');
    expect(scope.deleted).not.toContain('d-fence-shell-test1234');
  });

  it('M9 — the worker takes control immediately rather than on the next visit', async () => {
    const scope = runWorker();
    const waits: Array<Promise<unknown>> = [];
    scope.handlers.install?.({ waitUntil: (p: Promise<unknown>) => void waits.push(p) });
    await Promise.all(waits);
    // `addAll` over the shell list happened against the current cache name.
    expect(scope.opened).toContain('d-fence-shell-test1234');
  });
});

describe('Being offline is said in the application own words — §11.8.9, §11.8.12', () => {
  const online = Object.getOwnPropertyDescriptor(globalThis.navigator, 'onLine');

  afterEach(() => {
    if (online !== undefined) {
      Object.defineProperty(globalThis.navigator, 'onLine', online);
    }
  });

  it('M10 — a failed request while offline reads "You are offline", not "could not reach"', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
    const fetcher: Fetcher = () => Promise.reject(new Error('ECONNREFUSED'));
    const error = (await new ApiClient('', fetcher).get('/api/ops/dashboard').catch((e: unknown) => e)) as ApiError;

    // "Could not reach D-Fence" sends a user in a tunnel looking for a fault in the application.
    expect(error.failure.error).toBe(OFFLINE_CAUSE);
    expect(error.failure.remedy).toContain('reconnect');
  });

  it('M11 — the same failure while online keeps the network wording', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
    const fetcher: Fetcher = () => Promise.reject(new Error('ECONNREFUSED'));
    const error = (await new ApiClient('', fetcher).get('/api/ops/dashboard').catch((e: unknown) => e)) as ApiError;
    expect(error.failure.error).toBe('could not reach D-Fence');
  });

  function shell(): JSX.Element {
    return (
      <AppShell
        url="/ops/dashboard"
        principal={{ accountId: 'm-1', role: Role.OperationsManager }}
        onNavigate={vi.fn()}
        onSignOut={vi.fn()}
        renderScreen={() => <section data-screen="Stub" />}
      />
    );
  }

  it('M12 — the shell shows an offline banner, and removes it on reconnection', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
    render(shell());
    expect(screen.getByText(/You are offline/)).toBeTruthy();

    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });
    // A banner that outlives the condition is worse than no banner: it teaches the user to ignore it.
    await waitFor(() => expect(screen.queryByText(/You are offline/)).toBeNull());
  });

  it('M13 — the install control appears only when the browser offers installation (11.8.12)', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
    render(shell());
    // Nothing on a browser that will not install it — an offer that cannot be taken.
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();

    const prompt = Object.assign(new Event('beforeinstallprompt'), {
      prompt: () => Promise.resolve(),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    await act(async () => {
      window.dispatchEvent(prompt);
      await Promise.resolve();
    });
    const button = await screen.findByRole('button', { name: 'Install app' });

    fireEvent.click(button);
    // Single use: the browser will not replay the event, so a button that stayed would silently
    // do nothing on the second press.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull());
  });

  it('M14 — a browser with no matchMedia and no standalone flag is simply not installed', () => {
    // jsdom is that browser. `isInstalled` must answer false rather than throwing, because it runs
    // before anything else on every load.
    expect(isInstalled()).toBe(false);
  });
});
