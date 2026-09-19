/**
 * D-Fence — ReportRoutes.
 * Stereotype: <<boundary>>. Traces: 5.1.1–5.1.14, 5.2.9, 5.3.5, 2.3.2, 10.5.3, 10.6.4.
 *
 * Routes:
 *   POST /api/reports                    submit a breeding-site report (5.1.1)
 *   GET  /api/reports/mine               the caller's own reports (2.3.2)
 *   GET  /api/reports/:id                the anonymised view of one report (5.2.9, 5.3.5)
 *   GET  /api/reports/:id/history        what has happened to it, for its reporter (11.2.10, 5.2.1)
 *   POST /api/reports/:id/corroborate    confirm an existing report instead (5.1.12, 5.1.13)
 *
 * **Why the history is a second request rather than a field on the detail.** 11.2.10 asks the
 * Report Detail screen for "its photographs and its status history", but the two are not readable
 * by the same people. `publicView` is the anonymised view any resident may fetch; the history
 * names when a moderator decided, and 5.2.9 keeps that from everyone but the reporter — a manager
 * reads the richer audit trail instead (2.4.1), which is why `report:readIdentified` is a Resident
 * permission and not a shared one. `ReportController.statusHistory` already applies exactly that
 * rule, so this route calls it rather than re-deriving a narrower version of it beside the wider
 * one — which is how one disclosure rule becomes two implementations that later disagree.
 *
 * **No business rule lives in this file.** The duplicate radius, the photo limits and the visibility
 * rule are all decided in the control and entity layers; this class translates and maps errors.
 * The one thing it does decide is the status code, and there the interesting case is 409: a
 * duplicate is not a bad request, and the body carries the report to confirm because 5.1.12
 * requires the resident to be offered it.
 */
import { RouteHandler, Request, Response } from './RouteHandler';
import { AccessControlService } from '../../control/AccessControlService';
import { ReportController, DuplicateReport, ReportRejected, ReportDraft } from '../../control/ReportController';
import { GeoPoint } from '../../entity/valueTypes';
import { LocationContext, PestType, ReportType } from '../../entity/enums';

interface SubmitBody {
  latitude?: number;
  longitude?: number;
  type?: string;
  /** 5.1.15 */
  pestType?: string;
  /** 5.1.16 */
  locationContext?: string;
  /** 5.1.17 */
  injuryReported?: boolean;
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
    return ['/api/reports/mine', '/api/reports/:id/history', '/api/reports/:id'];
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
        case '/api/reports/:id/history': {
          // ISO strings, not `Date` objects: JSON has no date type, so serialising the entity's
          // own `Date` would hand the screen whatever the boundary's serialiser chose that day.
          const history = await this.reports.statusHistory(req.params.id ?? '', principal);
          res.json({
            history: history.map((entry) => ({
              from: entry.from,
              to: entry.to,
              at: entry.at.toISOString(),
            })),
          });
          return;
        }
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
  private static draftOf(req: Request): ReportDraft {
    const body = (req.body ?? {}) as SubmitBody;
    if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
      throw new ReportRejected('a report needs a location: send latitude and longitude (5.1.2)');
    }
    return {
      point: new GeoPoint(body.latitude, body.longitude),
      type: body.type as ReportType, // validated against the five in the controller (5.1.3)
      // 5.1.15 — validated against the catalogue in the controller, like `type`. Defaulted to
      // Mosquito only for a client that predates v0.9; the v0.9 form always sends one.
      pestType: (body.pestType as PestType | undefined) ?? PestType.Mosquito,
      ...(body.locationContext === undefined
        ? {}
        : { locationContext: body.locationContext as LocationContext }), // 5.1.16
      ...(body.injuryReported === undefined ? {} : { injuryReported: body.injuryReported }), // 5.1.17
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
