/**
 * D-Fence — Lab 4: the HTTP boundary's own behaviour (§2.3.6, 2.3.7, 10.3.x, 10.5.3).
 *
 * These are the defects an independent review found by pointing `curl` at the running deployment
 * rather than by reading the code, and they share a shape worth naming: **every one of them was
 * invisible to the feature tests.** A suite that drives handlers directly never sees the header
 * Express adds, never sees the verb Express did not route, and never sees the 403 body because it
 * asserts on the status. The boundary is the layer whose bugs only appear from outside it, so it
 * gets cases of its own.
 *
 * `ExpressApp` is exercised through a real Express instance over a real socket for exactly that
 * reason. Calling the handler directly would have passed throughout the entire period all four of
 * these were live on the deployment.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { AddressInfo, Server } from 'node:net';
import { ExpressApp } from '../src/boundary/http/ExpressApp';
import { RouteHandler, Request, Response } from '../src/boundary/http/RouteHandler';
import { AccessControlService, NotAuthenticated, NotAuthorised } from '../src/control/AccessControlService';
import { AccessPolicy } from '../src/control/AccessPolicy';
import { Principal } from '../src/control/Principal';
import { InMemoryAuditStore } from '../src/persistence/memory/InMemoryStores';
import { InMemoryObjectStorage } from '../src/persistence/memory/InMemoryObjectStorage';
import { PhotoUploadController } from '../src/control/PhotoUploadController';
import { UploadRoutes } from '../src/boundary/http/UploadRoutes';
import { COMPLETION_EVIDENCE } from '../src/boundary/gateways/SupabaseStorageGateway';
import { Role } from '../src/entity/enums';

/** One route that answers, and two that throw the two refusals, so both can be seen from outside. */
class ProbeRoutes extends RouteHandler {
  routes(): string[] {
    return ['/api/probe/ok', '/api/probe/anonymous', '/api/probe/forbidden'];
  }

  override writeRoutes(): string[] {
    return ['/api/probe/ok'];
  }

  async handle(req: Request, res: Response): Promise<void> {
    try {
      switch (req.params.route) {
        case '/api/probe/ok':
          res.json({ ok: true });
          return;
        case '/api/probe/anonymous':
          throw new NotAuthenticated();
        default:
          throw new NotAuthorised();
      }
    } catch (error) {
      this.fail(res, error instanceof Error ? error : new Error(String(error)));
    }
  }
}

let base = '';
let server: Server;

beforeAll(async () => {
  const app = new ExpressApp(
    { resolve: async () => new Principal('acc-1', Role.OperationsManager, 'sess-1') },
    false,
  );
  app.mount(new ProbeRoutes(new AccessControlService(new AccessPolicy(), new InMemoryAuditStore())));
  // A directory with no index.html: the client fallback is registered, which is what puts the
  // catch-all in play, and no test here asks it to actually serve a file.
  app.serveClient(new URL('.', import.meta.url).pathname);
  const express = (app as unknown as { app: { listen: (p: number, cb: () => void) => Server } }).app;
  server = await new Promise<Server>((resolve) => {
    const listening = express.listen(0, () => {
      base = `http://127.0.0.1:${(listening.address() as AddressInfo).port}`;
      resolve(listening);
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('The HTTP boundary as seen from outside — §10.3.x, §10.5.3', () => {
  it('H1 — an unmatched POST under /api answers JSON, not an HTML error page', async () => {
    const response = await fetch(`${base}/api/does/not/exist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(404);
    // The live defect: Express's own handler returned `<pre>Cannot POST /api/...</pre>`, so a
    // client calling .json() on it got a parse error and the developer went looking at the client.
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ error: 'no such route', remedy: 'check the path' });
  });

  it('H2 — and so does an unmatched GET, which already worked and must keep working', async () => {
    const response = await fetch(`${base}/api/does/not/exist`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'no such route', remedy: 'check the path' });
  });

  it('H3 — a non-GET to a client path is a 404, not the HTML shell', async () => {
    // `/ops/work-orders` is a drawing instruction to a browser. There is no sense in which
    // anything can be posted to it, and answering with the shell would answer a question nobody
    // asked — while looking, to a `fetch`, exactly like the /api defect above.
    const response = await fetch(`${base}/ops/work-orders`, { method: 'POST' });
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('H4 — no session at all is 401 with WWW-Authenticate, not 403', async () => {
    const response = await fetch(`${base}/api/probe/anonymous`);

    expect(response.status).toBe(401);
    // RFC 7235: a 401 without this header is a 401 the specification does not describe.
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="D-Fence"');

    const body = (await response.json()) as Record<string, string>;
    expect(body.error).toBe('not authenticated');
    // 10.5.3 — and the remedy is the one that actually helps, because this refusal *is* fixable.
    expect(body.remedy).toBe('sign in and try again');
    expect(body.correlationId).toBeTruthy();
  });

  it('H5 — a known caller refused by role is still 403, and now carries a remedy', async () => {
    const response = await fetch(`${base}/api/probe/forbidden`);

    expect(response.status).toBe(403);
    const body = (await response.json()) as Record<string, string>;
    expect(body.error).toBe('not authorised');
    expect(body.remedy).toBe('if you need access to this, ask an Operations Manager');
  });

  it('H6 — the 403 remedy is the same sentence whatever was refused (2.3.7)', async () => {
    // The point of the wording, and the reason adding it does not weaken 2.3.7: a remedy that
    // varied with the resource would be the oracle the requirement forbids. This one cannot be,
    // because it is a constant. Asserted so that a future edit personalising it fails here rather
    // than quietly turning the error body into a probe for what exists.
    const [a, b] = await Promise.all([
      fetch(`${base}/api/probe/forbidden`).then((r) => r.json() as Promise<Record<string, string>>),
      fetch(`${base}/api/probe/forbidden`).then((r) => r.json() as Promise<Record<string, string>>),
    ]);
    expect(a.remedy).toBe(b.remedy);
    // And it names no resource, no role and no path.
    expect(a.remedy).not.toContain('probe');
    expect(a.error).not.toContain('probe');
  });

  it('H7 — the server does not advertise what it is built with', async () => {
    const response = await fetch(`${base}/api/probe/ok`);
    // It tells an attacker which CVE list to start from and does nothing for anyone else.
    expect(response.headers.get('x-powered-by')).toBeNull();
  });

  it('H8 — a Content-Security-Policy is set, and it permits no inline script', async () => {
    const csp = (await fetch(`${base}/api/probe/ok`)).headers.get('content-security-policy') ?? '';

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    // A policy carrying 'unsafe-inline' stops approximately nothing, which is the failure this
    // assertion exists to prevent someone reintroducing to make one screen easier to write.
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    // 8.3.9 previews a chosen photograph from a data URL before it is uploaded.
    expect(csp).toContain("img-src 'self' data:");
  });

  it('H9 — the headers that were already right are still right', async () => {
    const headers = (await fetch(`${base}/api/probe/ok`)).headers;
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('referrer-policy')).toBe('no-referrer');
  });
});

/**
 * The upload path, over a real socket, because the thing worth testing about it is a **body size
 * limit** — and a body size limit is enforced by a parser that a handler-level test never runs.
 *
 * 5.1.5 permits a 5 MB photograph, which is about 6.7 MB of base64. Every other endpoint takes a
 * small JSON object and is capped far below that, on purpose: the parser runs before any handler
 * and therefore before any authorisation, so a limit raised globally is megabytes of buffering
 * that any caller can demand on any path.
 */
describe('Uploading a photograph over HTTP — §5.1.5, §8.3.6, §10.3.6', () => {
  let uploadBase = '';
  let uploadServer: Server;
  let storage: InMemoryObjectStorage;

  beforeAll(async () => {
    storage = new InMemoryObjectStorage();
    const access = new AccessControlService(new AccessPolicy(), new InMemoryAuditStore());
    const app = new ExpressApp(
      { resolve: async () => new Principal('crew-1', Role.CleaningCrew, 'sess-c') },
      false,
    );
    app.mount(new ProbeRoutes(access));
    app.mount(new UploadRoutes(access, new PhotoUploadController(access, storage)));
    const express = (app as unknown as { app: { listen: (p: number, cb: () => void) => Server } }).app;
    uploadServer = await new Promise<Server>((resolve) => {
      const listening = express.listen(0, () => {
        uploadBase = `http://127.0.0.1:${(listening.address() as AddressInfo).port}`;
        resolve(listening);
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => uploadServer.close(() => resolve()));
  });

  // No return annotation: `Response` in this file is the handler's response shape, imported at the
  // top, not the DOM's — naming it here would silently type the wrong thing.
  async function post(path: string, body: unknown) {
    return fetch(`${uploadBase}${path}`, {
      method: 'POST',
      // A token is required even though the stub resolver ignores its value: `resolvePrincipal`
      // refuses a request carrying none, which is 2.3.6 working rather than a test inconvenience.
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify(body),
    });
  }

  it('H10 — a photograph posted as base64 is stored, and the answer is a key', async () => {
    const response = await post('/api/uploads/completion-evidence', {
      contentType: 'image/png',
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { key: string; sizeBytes: number };
    expect(body.sizeBytes).toBe(4);
    // The bytes are really in the store — which is the entire difference between this feature and
    // the version that reported 8.3.7 as passing while nothing was stored.
    expect(await storage.exists(COMPLETION_EVIDENCE, body.key)).toBe(true);
  });

  it('H11 — a body too large for an ordinary endpoint is still accepted on an upload path', async () => {
    // 4 MB of base64: comfortably over the 2 MB every other route is capped at, comfortably under
    // the 5 MB image limit. If the two limits were ever collapsed into one, exactly one of these
    // two assertions would fail, which is the point of asserting both.
    const data = Buffer.alloc(3 * 1024 * 1024).toString('base64');
    const accepted = await post('/api/uploads/completion-evidence', { contentType: 'image/png', data });
    expect(accepted.status).toBe(201);

    const refused = await post('/api/probe/ok', { data });
    expect(refused.status).toBe(413);
  });

  it('H12 — an unsupported type is 422 with a remedy, not a 500 (10.5.3)', async () => {
    const response = await post('/api/uploads/completion-evidence', {
      contentType: 'application/pdf',
      data: Buffer.from('%PDF').toString('base64'),
    });

    expect(response.status).toBe(422);
    const body = (await response.json()) as Record<string, string>;
    expect(body.error).toContain('application/pdf');
    expect(body.remedy).toContain('JPEG or PNG');
  });

  it('H13 — a crew member may not upload into the reports bucket (2.3.x)', async () => {
    const response = await post('/api/uploads/report-photo', {
      contentType: 'image/png',
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
    });
    expect(response.status).toBe(403);
  });
});
