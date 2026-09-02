/**
 * D-Fence — ClusterRoutes.
 * Stereotype: <<boundary>>. Routes: GET /api/clusters, /api/clusters/:id
 * Traces: 9.x
 */
import { RouteHandler, Request, Response } from './RouteHandler';

export class ClusterRoutes extends RouteHandler {
  async handle(_req: Request, _res: Response): Promise<void> {
    // TODO: authorise via this.ac, validate the body, call the control class, map the result.
    // No business rule belongs in this file — boundary classes translate, they do not decide.
    throw new Error('not implemented');
  }
}
