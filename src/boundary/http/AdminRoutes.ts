/**
 * D-Fence — AdminRoutes.
 * Stereotype: <<boundary>>. Routes: GET/POST /api/ops/staff
 * Traces: 2.2.x
 */
import { RouteHandler, Request, Response } from './RouteHandler';

export class AdminRoutes extends RouteHandler {
  /** Not implemented: this handler is skeleton, and declaring its paths keeps the
   *  route inventory honest rather than silently absent from the server. */
  routes(): string[] {
    return ["/api/ops/admin"];
  }

  async handle(_req: Request, _res: Response): Promise<void> {
    // TODO: authorise via this.ac, validate the body, call the control class, map the result.
    // No business rule belongs in this file — boundary classes translate, they do not decide.
    throw new Error('not implemented');
  }
}
