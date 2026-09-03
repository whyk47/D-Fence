/**
 * D-Fence — DashboardRoutes.
 * Stereotype: <<boundary>>. Traces: 7.1.x, 7.2.x, 7.4.2, 7.5.x, 2.3.3, 2.3.4, 10.5.3.
 *
 * Routes:
 *   GET /api/ops/dashboard          overview + attention panel (7.1, 7.5)
 *   GET /api/ops/priority           the priority table, with tier/sort query parameters (7.2)
 *   GET /api/ops/priority.csv       the current filtered view as CSV (7.4.2, 7.4.3)
 *   GET /api/ops/sources            source health (7.5.1)
 *
 * **No business rule lives in this file.** A boundary class translates HTTP into a control call and
 * a result into JSON; it does not decide. The only judgement here is which query parameters are
 * accepted, and every one of them is passed to the controller rather than applied locally.
 */
import { RouteHandler, Request, Response } from './RouteHandler';
import { AccessControlService } from '../../control/AccessControlService';
import { DashboardController, TableQuery, SortColumn } from '../../control/DashboardController';
import { AnalyticsController } from '../../control/AnalyticsController';
import { PriorityTier } from '../../entity/enums';

export class DashboardRoutes extends RouteHandler {
  constructor(
    ac: AccessControlService,
    private readonly dashboard: DashboardController,
    /** 7.3.x. Optional so the dashboard routes predate the charts rather than being blocked
     *  by them; the route answers `null` rather than 404 when it is absent. */
    private readonly analytics: AnalyticsController | null = null,
  ) {
    super(ac);
  }

  routes(): string[] {
    return [
      '/api/ops/dashboard',
      '/api/ops/priority',
      '/api/ops/priority.csv',
      '/api/ops/analytics',
      '/api/ops/sources',
    ];
  }

  async handle(req: Request, res: Response): Promise<void> {
    try {
      // Inside the try, not before it: an unresolved session throws NotAuthorised, and
      // outside the try that rejection escapes the handler and the caller gets no response at
      // all instead of 2.3.7's refusal.
      const principal = await this.resolvePrincipal(req);
      switch (req.params.route) {
        case '/api/ops/dashboard':
          res.json({
            overview: await this.dashboard.buildOverview(principal),
            attention: await this.dashboard.buildAttentionPanel(principal),
          });
          return;
        case '/api/ops/priority':
          res.json({ rows: await this.dashboard.buildPriorityTable(principal, DashboardRoutes.queryOf(req)) });
          return;
        case '/api/ops/priority.csv': {
          const rows = await this.dashboard.buildPriorityTable(principal, DashboardRoutes.queryOf(req));
          res.status(200).text(DashboardController.toCsv(rows), 'text/csv');
          return;
        }
        case '/api/ops/analytics':
          // 7.3.x — all five charts in one call. They are one screen, and five round trips for a
          // screen the manager opens first would spend the §10.1 budget on plumbing.
          res.json({ charts: await this.analytics?.buildAll(principal) ?? null });
          return;
        case '/api/ops/sources':
          res.json({ sources: await this.dashboard.reportSourceHealth() });
          return;
        default:
          res.status(404).json({ error: 'no such route', remedy: 'check the path' });
      }
    } catch (error) {
      this.fail(res, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 7.2.3, 7.2.4, 7.2.5. An unrecognised tier or sort column is **ignored**, not rejected: a
   * dashboard that 400s because a stale bookmark carries `?tier=Urgent` is worse than one that
   * shows the unfiltered table.
   */
  private static queryOf(req: Request): TableQuery {
    const q = req.params;
    const tier = Object.values(PriorityTier).find((t) => t === q.tier);
    const columns: SortColumn[] = ['rank', 'locality', 'caseSize', 'caseDelta', 'score', 'tier'];
    const sortBy = columns.find((c) => c === q.sortBy);
    return {
      ...(tier === undefined ? {} : { tier }),
      ...(sortBy === undefined ? {} : { sortBy }),
      ...(q.workOrderStatus === undefined ? {} : { workOrderStatus: q.workOrderStatus }),
      descending: q.descending === 'true',
    };
  }
}
