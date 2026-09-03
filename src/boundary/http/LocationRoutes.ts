/**
 * D-Fence — LocationRoutes.
 * Stereotype: <<boundary>>. Traces: 3.1.1–3.1.13, 3.1.17, 2.3.1, 10.5.3.
 *
 * Routes:
 *   GET  /api/locations                  the caller's saved locations, as cards (3.1.10)
 *   POST /api/locations/search           geocode; returns candidates to confirm (3.1.3, 3.1.4)
 *   POST /api/locations                  store a confirmed candidate (3.1.1, 3.1.6, 3.1.7)
 *   POST /api/locations/:id/delete       (3.1.11, 3.1.12)
 *
 * The two geocoding failures get **different status codes**, which is 3.1.13 and 3.1.17 made
 * operational: 404 means the address does not exist and retyping will help, 503 means the service
 * is unavailable and retyping will not. A client that renders both as "not found" is a client that
 * tells residents their home does not exist whenever a token lapses.
 */
import { RouteHandler, Request, Response } from './RouteHandler';
import { AccessControlService } from '../../control/AccessControlService';
import { SavedLocationController, LocationRejected } from '../../control/SavedLocationController';
import { AddressNotFound, GeocodingUnavailable } from '../../control/GeocodingController';
import { GeoPoint } from '../../entity/valueTypes';
import { LocationLabel } from '../../entity/enums';

interface AddBody {
  inputText?: string;
  label?: string;
  name?: string;
  candidate?: { latitude?: number; longitude?: number; address?: string; postalCode?: string | null };
}

export class LocationRoutes extends RouteHandler {
  constructor(
    ac: AccessControlService,
    private readonly locations: SavedLocationController,
  ) {
    super(ac);
  }

  routes(): string[] {
    return ['/api/locations'];
  }

  override writeRoutes(): string[] {
    return ['/api/locations/search', '/api/locations', '/api/locations/:id/delete'];
  }

  async handle(req: Request, res: Response): Promise<void> {
    const id = req.params.id ?? '';
    try {
      const principal = await this.resolvePrincipal(req);
      switch (req.params.route) {
        case '/api/locations/search': {
          const text = ((req.body ?? {}) as { text?: string }).text ?? '';
          res.json({ candidates: await this.locations.search(text, principal) });
          return;
        }
        case '/api/locations': {
          if (req.body === undefined || req.body === null || Object.keys(req.body as object).length === 0) {
            const saved = await this.locations.listLocations(principal);
            res.json({ locations: saved.map((l) => l.card()) });
            return;
          }
          const body = req.body as AddBody;
          const label = Object.values(LocationLabel).find((l) => l === body.label);
          if (label === undefined) {
            throw new LocationRejected(`${String(body.label)} is not one of the four labels (3.1.6)`);
          }
          if (typeof body.candidate?.latitude !== 'number' || typeof body.candidate.longitude !== 'number') {
            // A location must come from a confirmed candidate (3.1.4), not from raw coordinates a
            // client invented — otherwise the confirmation step is decorative.
            throw new LocationRejected('choose one of the candidates returned by the search (3.1.4)');
          }
          const location = await this.locations.addLocation(
            {
              candidate: {
                point: new GeoPoint(body.candidate.latitude, body.candidate.longitude),
                address: body.candidate.address ?? 'unnamed location',
                postalCode: body.candidate.postalCode ?? null,
              },
              label,
              ...(body.name === undefined ? {} : { name: body.name }),
              inputText: body.inputText ?? '',
            },
            principal,
          );
          res.status(201).json(location.card());
          return;
        }
        case '/api/locations/:id/delete': {
          const result = await this.locations.removeLocation(id, principal);
          // 3.1.12's cascade is stated, not silent: a resident deleting a location should see that
          // its alerts went with it.
          res.json({ deleted: id, subscriptionsRemoved: result.subscriptionsRemoved });
          return;
        }
        default:
          res.status(404).json({ error: 'no such route', remedy: 'check the path' });
      }
    } catch (error) {
      if (error instanceof AddressNotFound) {
        res.status(404).json({ error: error.message, remedy: 'check the address or postal code and try again' }); // 3.1.13
        return;
      }
      if (error instanceof GeocodingUnavailable) {
        res.status(503).json({ error: error.message, remedy: 'try again in a few minutes' }); // 3.1.17
        return;
      }
      if (error instanceof LocationRejected) {
        res.status(400).json({ error: error.reason, remedy: 'correct the details and try again' });
        return;
      }
      this.fail(res, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
