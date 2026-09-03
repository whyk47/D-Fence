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
  constructor(private readonly resolver: PrincipalResolver | null = null) {
    this.app.use(express.json({ limit: '2mb' }));
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

  listen(port: number): void {
    this.app.listen(port, () => {
      console.log(`D-Fence listening on http://localhost:${port}`);
      console.log(`  GET:  ${this.handlers.flatMap((h) => h.routes()).join(', ')}`);
      const writes = this.handlers.flatMap((h) => h.writeRoutes());
      if (writes.length > 0) {
        console.log(`  POST: ${writes.join(', ')}`);
      }
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
    };
    return wrapper;
  }
}
