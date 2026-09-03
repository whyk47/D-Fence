/**
 * D-Fence — MapRoutes.
 * Stereotype: <<boundary>>. Traces: 9.1.1–9.1.11, 2.3.1, 2.3.3–2.3.5.
 *
 * Routes:
 *   GET /api/map/layers          the layers this caller may see (9.1.1–9.1.6)
 *   GET /api/map/clusters/:id    the cluster detail panel (9.1.7–9.1.10)
 *
 * One endpoint returns every layer rather than one endpoint per layer. 9.1.6 is about showing and
 * hiding, which the client does without asking the server again — four round trips to draw one map
 * would make toggling a layer a network operation.
 */
import { RouteHandler, Request, Response } from './RouteHandler';
import { AccessControlService } from '../../control/AccessControlService';
import { MapViewController } from '../../control/MapViewController';

export class MapRoutes extends RouteHandler {
  constructor(
    ac: AccessControlService,
    private readonly map: MapViewController,
  ) {
    super(ac);
  }

  routes(): string[] {
    return ['/api/map/layers', '/api/map/clusters/:id'];
  }

  async handle(req: Request, res: Response): Promise<void> {
    try {
      const principal = await this.resolvePrincipal(req);
      switch (req.params.route) {
        case '/api/map/layers':
          res.json(await this.map.layers(principal));
          return;
        case '/api/map/clusters/:id':
          res.json(await this.map.clusterDetail(req.params.id ?? '', principal));
          return;
        default:
          res.status(404).json({ error: 'no such route', remedy: 'check the path' });
      }
    } catch (error) {
      this.fail(res, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
