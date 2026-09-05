/**
 * D-Fence — service worker.
 * Traces: 11.8.7, 11.8.8, 11.8.10, 11.8.11.
 *
 * The whole of the offline story, in one file with no build step of its own. `__BUILD__` is
 * replaced by `client/build.mjs` with a hash of the bundle, which is what makes 11.8.11 work: a
 * deployment changes the hash, the cache name changes with it, and `activate` deletes every cache
 * that is not the current one. A fixed cache name is how an installed application ends up serving
 * a version of itself that no longer exists on the server, with no way for the user to escape it
 * short of clearing site data.
 *
 * **Nothing under `/api/` is ever cached (11.8.10).** A cached cluster count would be presented by
 * a screen that also claims, under 7.1.9, to be showing how fresh its data is — so the caching
 * would not merely be stale, it would make a true statement false. The shell is cacheable because
 * it is inert: HTML, CSS and a bundle that render nothing until they have fetched something.
 *
 * **Network first, cache as the fallback.** The opposite (cache first) is faster and is what most
 * service-worker examples do, but it serves the previous bundle to a user who is online, which is
 * exactly the failure that makes teams distrust service workers. Here the cache is what the
 * network cannot supply, and nothing more.
 */
const VERSION = '__BUILD__';
const CACHE = `d-fence-shell-${VERSION}`;

/** The application shell: everything needed to draw a screen that then asks for data. */
const SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // `skipWaiting` so a returning user gets the new shell on this load rather than the next one.
  // Safe here because the shell is self-contained: there is no half-old, half-new state to land in.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  // Another origin's response is not ours to store, and 10.4.5's attribution rules are about what
  // we fetch rather than what we keep.
  if (url.origin !== self.location.origin) {
    return;
  }
  // 11.8.10 — the API is never cached, in either direction. Falling through without calling
  // `respondWith` leaves the request to the browser, which is the correct handling.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only a complete, successful, same-origin response is worth keeping. A 404 cached as the
        // shell would survive the fix that removed it.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached !== undefined) {
          return cached;
        }
        // 11.8.8 — every client-side route is drawn by the same shell, so an offline deep link
        // lands on the application rather than on the browser's error page. The application then
        // says "You are offline" in its own words (11.8.9).
        if (request.mode === 'navigate') {
          const shell = await caches.match('/index.html');
          if (shell !== undefined) {
            return shell;
          }
        }
        return new Response('', { status: 503, statusText: 'offline' });
      }),
  );
});
