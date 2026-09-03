/**
 * D-Fence — LocationRoutes.
 * Stereotype: <<boundary>>. Routes: GET/POST/DELETE /api/locations
 * Traces: 3.1.x, 2.3.1
 */
import { RouteHandler, Request, Response } from './RouteHandler';

export class LocationRoutes extends RouteHandler {
  /** Not implemented: this handler is skeleton, and declaring its paths keeps the
   *  route inventory honest rather than silently absent from the server. */
  routes(): string[] {
    return ["/api/locations"];
  }

  async handle(_req: Request, _res: Response): Promise<void> {
    // TODO: authorise via this.ac, validate the body, call the control class, map the result.
    // No business rule belongs in this file — boundary classes translate, they do not decide.
    throw new Error('not implemented');
  }
}
