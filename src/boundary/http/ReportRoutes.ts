/**
 * D-Fence — ReportRoutes.
 * Stereotype: <<boundary>>. Traces: 5.1.1–5.1.14, 5.2.9, 5.3.5, 2.3.2, 10.5.3, 10.6.4.
 *
 * Routes:
 *   POST /api/reports                    submit a breeding-site report (5.1.1)
 *   GET  /api/reports/mine               the caller's own reports (2.3.2)
 *   GET  /api/reports/:id                the anonymised view of one report (5.2.9, 5.3.5)
 *   POST /api/reports/:id/corroborate    confirm an existing report instead (5.1.12, 5.1.13)
 *
 * **No business rule lives in this file.** The duplicate radius, the photo limits and the visibility
 * rule are all decided in the control and entity layers; this class translates and maps errors.
 * The one thing it does decide is the status code, and there the interesting case is 409: a
 * duplicate is not a bad request, and the body carries the report to confirm because 5.1.12
 * requires the resident to be offered it.
 */
import { RouteHandler, Request, Response } from './RouteHandler';
import { AccessControlService } from '../../control/AccessControlService';
import { ReportController, DuplicateReport, ReportRejected } from '../../control/ReportController';
import { GeoPoint } from '../../entity/valueTypes';
import { ReportType } from '../../entity/enums';

interface SubmitBody {
  latitude?: number;
  longitude?: number;
  type?: string;
  description?: string;
  photos?: Array<{ filename?: string; contentType?: string; sizeBytes?: number; storageKey?: string }>;
}

export class ReportRoutes extends RouteHandler {
  constructor(
    ac: AccessControlService,
    private readonly reports: ReportController,
  ) {
    super(ac);
  }

  routes(): string[] {
    // `mine` is declared before `:id` so Express matches the literal path first.
    return ['/api/reports/mine', '/api/reports/:id'];
  }

  override writeRoutes(): string[] {
    return ['/api/reports', '/api/reports/:id/corroborate'];
  }

  async handle(req: Request, res: Response): Promise<void> {
    try {
      const principal = await this.resolvePrincipal(req);
      switch (req.params.route) {
        case '/api/reports': {
          const report = await this.reports.submitReport(ReportRoutes.draftOf(req), principal);
          res.status(201).json({ reportId: report.id, status: report.currentStatus(), locality: report.localityBinding });
          return;
        }
        case '/api/reports/mine':
          res.json({ reports: await this.reports.listOwnReports(principal) });
          return;
        case '/api/reports/:id':
          res.json(await this.reports.publicView(req.params.id ?? '', principal));
          return;
        case '/api/reports/:id/corroborate': {
          const report = await this.reports.confirmExisting(req.params.id ?? '', principal);
          res.json({ reportId: report.id, corroborationCount: report.corroborationCount });
          return;
        }
        default:
          res.status(404).json({ error: 'no such route', remedy: 'check the path' });
      }
    } catch (error) {
      if (error instanceof DuplicateReport) {
        // 5.1.12 — the refusal must offer the existing report, or the resident moves the pin ten
        // metres and files it anyway.
        res.status(409).json({
          error: error.message,
          remedy: 'confirm the existing report instead',
          existing: error.existing.publicProjection(),
        });
        return;
      }
      if (error instanceof ReportRejected) {
        // 10.5.3 — the reason is already phrased for the resident by the control layer.
        res.status(400).json({ error: error.reason, remedy: 'correct the submission and try again' });
        return;
      }
      this.fail(res, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 5.1.2, 5.1.3. An absent or unparseable coordinate is refused here rather than defaulted:
   * a report at (0, 0) would bind to Unassigned and look like a legitimate submission.
   */
  private static draftOf(req: Request): { point: GeoPoint; type: ReportType; description: string; photos: Array<{ filename: string; contentType: string; sizeBytes: number; storageKey: string }> } {
    const body = (req.body ?? {}) as SubmitBody;
    if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
      throw new ReportRejected('a report needs a location: send latitude and longitude (5.1.2)');
    }
    return {
      point: new GeoPoint(body.latitude, body.longitude),
      type: body.type as ReportType, // validated against the five in the controller (5.1.3)
      description: body.description ?? '',
      photos: (body.photos ?? []).map((p) => ({
        filename: p.filename ?? 'photo',
        contentType: p.contentType ?? 'application/octet-stream',
        sizeBytes: p.sizeBytes ?? 0,
        storageKey: p.storageKey ?? '',
      })),
    };
  }
}
