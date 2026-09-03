/**
 * D-Fence — ModerationRoutes.
 * Stereotype: <<boundary>>. Traces: 5.2.3, 5.2.4, 5.3.1–5.3.5, 2.3.4, 10.5.3.
 *
 * Routes:
 *   GET  /api/ops/moderation             the queue, oldest first, ?clusterId= and ?type= (5.3.1–5.3.3)
 *   GET  /api/ops/moderation/:id         one report with its photographs, for review (2.3.4)
 *   POST /api/ops/moderation/:id/verify  (5.2.3)
 *   POST /api/ops/moderation/:id/reject  body { reason } (5.2.3, 5.2.4)
 *
 * Both filters are query parameters passed straight to the controller. Filtering here would put a
 * §5.3.3 rule in a boundary class, and filtering in the browser would ship pending reports —
 * photographs included — to a client that 5.3.5 says must not have them.
 */
import { RouteHandler, Request, Response } from './RouteHandler';
import { AccessControlService } from '../../control/AccessControlService';
import { ModerationController } from '../../control/ModerationController';
import { ReportTransitionRefused } from '../../control/ReportLifecycleController';
import { ReportType } from '../../entity/enums';

export class ModerationRoutes extends RouteHandler {
  constructor(
    ac: AccessControlService,
    private readonly moderation: ModerationController,
  ) {
    super(ac);
  }

  routes(): string[] {
    return ['/api/ops/moderation', '/api/ops/moderation/:id'];
  }

  override writeRoutes(): string[] {
    return ['/api/ops/moderation/:id/verify', '/api/ops/moderation/:id/reject'];
  }

  async handle(req: Request, res: Response): Promise<void> {
    const principal = this.principalOf(req);
    const id = req.params.id ?? '';
    try {
      switch (req.params.route) {
        case '/api/ops/moderation': {
          const type = Object.values(ReportType).find((t) => t === req.params.type);
          res.json({
            queue: await this.moderation.listQueue(principal, {
              ...(req.params.clusterId === undefined ? {} : { clusterId: req.params.clusterId }),
              ...(type === undefined ? {} : { type }),
            }),
          });
          return;
        }
        case '/api/ops/moderation/:id':
          res.json(await this.moderation.review(id, principal));
          return;
        case '/api/ops/moderation/:id/verify': {
          const report = await this.moderation.verify(id, principal);
          res.json({ reportId: report.id, status: report.currentStatus() });
          return;
        }
        case '/api/ops/moderation/:id/reject': {
          const reason = ((req.body ?? {}) as { reason?: string }).reason ?? '';
          const report = await this.moderation.reject(id, reason, principal);
          res.json({ reportId: report.id, status: report.currentStatus() });
          return;
        }
        default:
          res.status(404).json({ error: 'no such route', remedy: 'check the path' });
      }
    } catch (error) {
      if (error instanceof ReportTransitionRefused) {
        // 8.3.16's sibling for reports: the refusal states which rule refused and what to do.
        res.status(422).json({ error: error.reason, remedy: `the report is ${error.from}` });
        return;
      }
      this.fail(res, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
