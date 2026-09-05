/**
 * D-Fence — UploadRoutes.
 * Stereotype: <<boundary>>. Traces: 5.1.5, 8.3.6, 8.3.7, 10.3.6, 10.5.3.
 *
 * Routes:
 *   POST /api/uploads/report-photo         body { contentType, data } → { key, ... } (5.1.5)
 *   POST /api/uploads/completion-evidence  body { contentType, data } → { key, ... } (8.3.6)
 *
 * Two paths rather than one taking a `bucket`, for the reason set out in `PhotoUploadController`:
 * which bucket an image may enter is an access rule, and an access rule read out of the request
 * body is not one. The path is fixed, so the purpose is fixed, so the permission checked is fixed.
 *
 * These are the only paths in the system whose body may exceed the ordinary limit — a 5 MB image
 * is about 6.7 MB of base64 — which is why `largeBodyRoutes()` names them.
 */
import { RouteHandler, Request, Response } from './RouteHandler';
import { AccessControlService } from '../../control/AccessControlService';
import { PhotoUploadController, UploadPurpose, UploadRefused } from '../../control/PhotoUploadController';

interface UploadBody {
  contentType?: string;
  /** Base64, or a `data:` URL — `FileReader.readAsDataURL` produces the latter. */
  data?: string;
}

const PURPOSES: ReadonlyMap<string, UploadPurpose> = new Map<string, UploadPurpose>([
  ['/api/uploads/report-photo', 'report'],
  ['/api/uploads/completion-evidence', 'completion'],
]);

export class UploadRoutes extends RouteHandler {
  constructor(
    ac: AccessControlService,
    private readonly uploads: PhotoUploadController,
  ) {
    super(ac);
  }

  routes(): string[] {
    // Nothing here is readable: an image is read through a signed URL, never through this handler.
    return [];
  }

  override writeRoutes(): string[] {
    return [...PURPOSES.keys()];
  }

  override largeBodyRoutes(): string[] {
    return [...PURPOSES.keys()];
  }

  async handle(req: Request, res: Response): Promise<void> {
    try {
      const purpose = PURPOSES.get(req.params.route ?? '');
      if (purpose === undefined) {
        res.status(404).json({ error: 'no such route', remedy: 'check the path' });
        return;
      }
      const principal = await this.resolvePrincipal(req);
      const body = (req.body ?? {}) as UploadBody;
      const stored = await this.uploads.upload(
        purpose,
        body.contentType ?? '',
        body.data ?? '',
        principal,
      );
      // The key and nothing else the client did not already know. In particular no URL: the client
      // gets one by asking for it, when it needs it, and it expires (10.3.5).
      res.status(201).json({ key: stored.key, contentType: stored.contentType, sizeBytes: stored.sizeBytes });
    } catch (error) {
      if (error instanceof UploadRefused) {
        // 422, not 400: the request was well-formed JSON and the server understood it perfectly —
        // what was wrong was the photograph. 10.5.3's remedy is the uploader's actual next step.
        res.status(422).json({ error: error.reason, remedy: error.remedy });
        return;
      }
      this.fail(res, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
