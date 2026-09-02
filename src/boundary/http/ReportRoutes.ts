/**
 * D-Fence — ReportRoutes.
 * Stereotype: <<boundary>>. Routes: GET/POST /api/reports, POST /api/reports/:id/corroborate
 * Traces: 5.1.x, 2.3.2
 */
import { RouteHandler, Request, Response } from './RouteHandler';

export class ReportRoutes extends RouteHandler {
  async handle(_req: Request, _res: Response): Promise<void> {
    // TODO: authorise via this.ac, validate the body, call the control class, map the result.
    // No business rule belongs in this file — boundary classes translate, they do not decide.
    throw new Error('not implemented');
  }
}
