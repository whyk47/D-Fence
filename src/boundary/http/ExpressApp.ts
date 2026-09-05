/**
 * D-Fence — HTTP surface.
 * Stereotype: <<boundary>>. Traces: 10.3.2, 10.5.3, 10.6.4.
 *
 * Thin on purpose. Express is an adapter detail: handlers speak the `Request`/`Response` shapes
 * declared in RouteHandler, so a handler can be unit-tested by calling it with a plain object and
 * no server (10.6.3). This class is the only place that knows Express exists.
 */
import express, { Express, Request as ExRequest, Response as ExResponse } from 'express';
import { RouteHandler, Request, Response, PrincipalResolver } from './RouteHandler';

export class ExpressApp {
  private readonly app: Express = express();
  private readonly handlers: RouteHandler[] = [];

  /**
   * @param resolver turns a bearer token into a principal (2.1.8, 2.3.6). Injected here, and
   *   handed to every handler at mount time, so a new route cannot be added without one — the
   *   alternative, each handler taking it in its constructor, is a step that can be forgotten.
   */
  /**
   * @param requireHttps 10.3.2. Off in development, because localhost has no certificate and a
   *   redirect loop is a worse first experience than plain HTTP on a laptop. On in a deployment,
   *   where it redirects and sets HSTS.
   */
  constructor(
    private readonly resolver: PrincipalResolver | null = null,
    private readonly requireHttps = false,
  ) {
    // Express advertises itself in a header on every response. It tells an attacker which stack
    // and therefore which CVE list to start from, and it does nothing for anyone else.
    this.app.disable('x-powered-by');
    /**
     * Two body limits, chosen per route rather than globally.
     *
     * Every endpoint in the system takes a small JSON object except the two that take a
     * photograph, and 5.1.5's 5 MB image is about 6.7 MB once base64-encoded. Raising the limit
     * everywhere to accommodate them would hand every caller, authenticated or not, eight
     * megabytes of buffering on any path at all — the parser runs before any handler and therefore
     * before any authorisation. The set is populated by `mount` from what each handler declares.
     */
    const standardBody = express.json({ limit: '2mb' });
    const largeBody = express.json({ limit: '8mb' });
    this.app.use((req: ExRequest, res: ExResponse, next: () => void) => {
      (this.largeBodyPaths.has(req.path) ? largeBody : standardBody)(req, res, next);
    });
    this.app.use((req: ExRequest, res: ExResponse, next: () => void) => {
      // Behind a proxy or a platform load balancer, TLS terminates upstream and the only evidence
      // of the original scheme is this header. `req.secure` alone reports false for every request
      // in that arrangement, which is most deployments.
      const proto = req.headers['x-forwarded-proto'];
      const secure = req.secure || proto === 'https';
      if (this.requireHttps && !secure) {
        // 10.3.2. A redirect rather than a refusal: the request already travelled in the clear, so
        // anything sensitive in it is already exposed — what this prevents is the *next* one.
        res.redirect(308, `https://${req.headers.host ?? ''}${req.originalUrl}`);
        return;
      }
      if (this.requireHttps) {
        // Tell the browser not to try HTTP again for a year, which is the half of 10.3.2 a
        // redirect cannot do: a redirect only helps after the first request has already leaked.
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }
      // Cheap and unconditional: nothing here is meant to be framed or sniffed (10.3.x).
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'no-referrer');
      /**
       * 10.3.x — a Content-Security-Policy, which is the header that actually stops an injected
       * script rather than merely discouraging one.
       *
       * It can be this strict because the client earns it: `index.html` has no inline script and no
       * inline style, the bundle loads no external resource, and the only origin anything is
       * fetched from is this one. That was checked rather than assumed — the single external URL
       * in the bundle is a link inside a React error message.
       *
       * `'unsafe-inline'` appears nowhere, which is the whole point: a policy that allows it stops
       * approximately nothing. If a future screen needs an inline style, the answer is a class in
       * `styles.css`, not a weaker policy here.
       *
       * `data:` is permitted for images alone, because a photograph chosen on a phone is previewed
       * from a data URL before it is uploaded (8.3.9).
       */
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self'",
          "img-src 'self' data:",
          "connect-src 'self'",
          "font-src 'self'",
          // 11.8.7 — the service worker is same-origin, and `worker-src` does not fall back to
          // `default-src` in every browser; without it Safari refuses the registration.
          "worker-src 'self'",
          // 11.8.1 — Chrome checks `manifest-src` before it will offer installation at all.
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          // The header equivalent of X-Frame-Options: DENY, which CSP supersedes.
          "frame-ancestors 'none'",
        ].join('; '),
      );
      next();
    });

    /**
     * A liveness probe, registered in the constructor so it exists before any handler and cannot be
     * shadowed by the client's catch-all.
     *
     * **Deliberately does not touch the database.** A hosting platform restarts a container whose
     * health check fails, so a probe that queried Postgres would turn a transient database blip into
     * a restart loop — and a restart cannot fix somebody else's database. It answers the question
     * the platform is actually asking: is this process alive and serving. It is also unauthenticated
     * and says nothing about the system beyond its own uptime, so it is not an intelligence source.
     */
    this.app.get('/api/health', (_req: ExRequest, res: ExResponse) => {
      res.status(200).json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
    });
  }

  /** 10.3.2 — exposed so a test can assert the policy without standing up a TLS listener. */
  static redirectTargetFor(host: string, url: string): string {
    return `https://${host}${url}`;
  }

  mount(handler: RouteHandler): void {
    if (this.resolver !== null) {
      handler.useResolver(this.resolver);
    }
    this.handlers.push(handler);
    for (const route of handler.routes()) {
      this.app.get(route, (req: ExRequest, res: ExResponse) => {
        void handler.handle(ExpressApp.toRequest(req, route), ExpressApp.toResponse(res));
      });
    }
    for (const route of handler.largeBodyRoutes()) {
      this.largeBodyPaths.add(route);
    }
    for (const route of handler.writeRoutes()) {
      this.app.post(route, (req: ExRequest, res: ExResponse) => {
        void handler.handle(ExpressApp.toRequest(req, route), ExpressApp.toResponse(res));
      });
    }
  }

  /** Escape hatch for pages that are not JSON APIs — the dev dashboard, health checks. */
  page(path: string, render: () => Promise<string>): void {
    this.app.get(path, (_req: ExRequest, res: ExResponse) => {
      void render()
        .then((html) => res.type('html').send(html))
        .catch((error: unknown) => res.status(500).send(String(error)));
    });
  }

  /**
   * Serve the built client, and hand every unmatched non-API path to it.
   *
   * **Call this last.** Express matches in registration order, and the fallback below answers
   * anything left over — registered before the API it would swallow every route in the system and
   * return the shell's HTML where JSON was expected, which presents as a client that has gone mad
   * rather than as a misordered server.
   *
   * The fallback is what makes a deep link work. `/ops/work-orders/abc` is a client-side route: the
   * server has never heard of it, but a manager who bookmarks it, or refreshes on it, must not get
   * a 404 — 11.3.2's dialog map has no state called "you reloaded the page".
   *
   * An unmatched **`/api/`** path deliberately falls through to a JSON 404 instead. Returning HTML
   * to a `fetch` would surface as a parse error in the client, and the developer would go looking
   * in the wrong place entirely.
   */
  serveClient(directory: string): void {
    /**
     * 11.8.1, 11.8.7, 11.8.11 — three files that `express.static` would serve with the wrong
     * headers, registered before it so they win.
     *
     * The manifest needs `application/manifest+json`; served as `application/json` Chrome ignores
     * it and never offers installation. The service worker must not be cached — a cached `sw.js`
     * is a worker that can never be replaced, which is the one failure mode that outlives a
     * deployment and cannot be fixed from the server side.
     */
    this.app.get('/manifest.webmanifest', (_req: ExRequest, res: ExResponse) => {
      res.type('application/manifest+json');
      res.sendFile('manifest.webmanifest', { root: directory });
    });
    this.app.get('/sw.js', (_req: ExRequest, res: ExResponse) => {
      res.type('application/javascript');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      // A worker's scope cannot rise above the path it is served from; this header is what lets a
      // root-scoped worker be served from anywhere, and it is free insurance if the path moves.
      res.setHeader('Service-Worker-Allowed', '/');
      res.sendFile('sw.js', { root: directory });
    });
    this.app.use(
      express.static(directory, {
        // The bundle's name is fixed, so it must not be cached across a deployment; the index is
        // small and is always revalidated. Correctness over cleverness — a stale bundle served to
        // a marker is not a trade worth making for a few kilobytes.
        etag: true,
        maxAge: 0,
      }),
    );
    /**
     * `all`, not `get`.
     *
     * This was registered for GET only, so an unmatched **POST** fell past it to Express's built-in
     * handler and came back as an HTML error page — `<pre>Cannot POST /api/…</pre>` — while the
     * same path answered correct JSON to a GET. A client `fetch` calling `.json()` on that gets a
     * parse error, which sends whoever is debugging it looking at the client rather than at the
     * route table.
     *
     * A non-GET to a **client** path is a 404 rather than the shell: `/ops/work-orders` is a
     * drawing instruction to a browser, and there is no sense in which anything can be posted to
     * it. Returning the HTML shell to such a request would be answering a question nobody asked.
     */
    this.app.all('*', (req: ExRequest, res: ExResponse) => {
      if (req.path.startsWith('/api/') || req.method !== 'GET') {
        res.status(404).json({ error: 'no such route', remedy: 'check the path' });
        return;
      }
      res.sendFile('index.html', { root: directory });
    });
    this.clientDirectory = directory;
  }

  /** Populated at mount time from each handler's `largeBodyRoutes()`. */
  private readonly largeBodyPaths = new Set<string>();

  private clientDirectory: string | null = null;

  listen(port: number): void {
    this.app.listen(port, () => {
      console.log(`D-Fence listening on http://localhost:${port}`);
      console.log(`  GET:  ${this.handlers.flatMap((h) => h.routes()).join(', ')}`);
      const writes = this.handlers.flatMap((h) => h.writeRoutes());
      if (writes.length > 0) {
        console.log(`  POST: ${writes.join(', ')}`);
      }
      console.log(
        this.clientDirectory === null
          ? '  Client: NOT served — run `npm run build:client` and restart.'
          : '  Client: served from the built bundle; open the address above in a browser.',
      );
    });
  }

  private static toRequest(req: ExRequest, route: string): Request {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    }
    return {
      headers,
      // The route is carried in params so a handler serving several paths can switch on it without
      // Express-specific types leaking into the control layer.
      params: { ...(req.query as Record<string, string>), ...(req.params as Record<string, string>), route },
      body: req.body,
    };
  }

  private static toResponse(res: ExResponse): Response {
    const wrapper: Response = {
      status(code: number): Response {
        res.status(code);
        return wrapper;
      },
      json(body: unknown): void {
        res.json(body);
      },
      text(body: string, contentType = 'text/plain'): void {
        res.type(contentType).send(body);
      },
      header(name: string, value: string): void {
        res.setHeader(name, value);
      },
    };
    return wrapper;
  }
}
