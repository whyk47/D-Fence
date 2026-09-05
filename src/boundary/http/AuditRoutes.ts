/**
 * D-Fence — AuditRoutes.
 * Stereotype: <<boundary>>. Traces: 2.3.4, 2.3.8, 2.4.1, 2.4.2, 10.5.3.
 *
 * Routes:
 *   GET /api/ops/audit                        the trail, newest first, ?limit= (2.4.1)
 *   GET /api/ops/work-orders/:id/history      one work order's audited history (8.3.x, 2.4.1)
 *   GET /api/ops/reports/:id/history          one report's audited history (5.2.x, 2.4.1)
 *
 * **The endpoint `WorkOrderRoutes` already promised.** That file explains, correctly, that a work
 * order keeps no second copy of who moved it — two records of the same fact eventually disagree,
 * and only one of them is the one that may not be edited — and says the client reads history from
 * the audit endpoint instead. The endpoint did not exist, which turned a good design decision into
 * an unkept promise and left 2.4.1 unsatisfiable through the API.
 *
 * The entity kind is fixed by the path rather than read from a query parameter, for the same
 * reason the photograph upload paths fix their bucket: it reaches a WHERE clause, and a caller
 * choosing it is a caller choosing what the query means.
 */
import { RouteHandler, Request, Response } from './RouteHandler';
import { AccessControlService } from '../../control/AccessControlService';
import { AuditController, AuditView } from '../../control/AuditController';

export class AuditRoutes extends RouteHandler {
  constructor(
    ac: AccessControlService,
    private readonly audit: AuditController,
  ) {
    super(ac);
  }

  routes(): string[] {
    return ['/api/ops/audit', '/api/ops/work-orders/:id/history', '/api/ops/reports/:id/history'];
  }

  async handle(req: Request, res: Response): Promise<void> {
    try {
      const principal = await this.resolvePrincipal(req);
      const limit = AuditRoutes.limitOf(req.params.limit);
      switch (req.params.route) {
        case '/api/ops/audit': {
          const entries = await this.audit.recent(limit, principal);
          res.json({ entries: entries.map(AuditRoutes.row), count: entries.length });
          return;
        }
        case '/api/ops/work-orders/:id/history': {
          const entries = await this.audit.history('WorkOrder', req.params.id ?? '', limit, principal);
          res.json({ workOrderId: req.params.id ?? '', entries: entries.map(AuditRoutes.row) });
          return;
        }
        case '/api/ops/reports/:id/history': {
          const entries = await this.audit.history('Report', req.params.id ?? '', limit, principal);
          res.json({ reportId: req.params.id ?? '', entries: entries.map(AuditRoutes.row) });
          return;
        }
        default:
          res.status(404).json({ error: 'no such route', remedy: 'check the path' });
      }
    } catch (error) {
      this.fail(res, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * An empty history is an empty list and a 200, never a 404.
   *
   * "Nothing has happened to this work order yet" and "there is no such work order" are different
   * facts, and only the first one is this endpoint's to answer. Returning 404 for an untouched
   * entity would also make the trail an existence oracle, which 2.3.7 forbids.
   */
  private static row(entry: AuditView): Record<string, unknown> {
    return {
      accountId: entry.accountId,
      action: entry.action,
      refused: entry.refused,
      targetEntity: entry.targetEntity,
      targetId: entry.targetId,
      occurredAt: entry.occurredAt.toISOString(),
    };
  }

  private static limitOf(raw: string | undefined): number | undefined {
    if (raw === undefined || raw === '') {
      return undefined;
    }
    const value = Number(raw);
    // Left to the controller to bound: a boundary class that clamps as well would be a second
    // place the rule lives, and the two would drift.
    return Number.isFinite(value) ? value : undefined;
  }
}
