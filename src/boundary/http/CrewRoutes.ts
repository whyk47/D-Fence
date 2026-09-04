/**
 * D-Fence — CrewRoutes.
 * Stereotype: <<boundary>>. Traces: 8.3.x, 8.4.1–8.4.6, 2.3.5, 10.5.3.
 *
 * Routes:
 *   GET  /api/crew/work-orders                  the crew member's own jobs, ?filter= (8.4.1, 8.4.6)
 *   GET  /api/crew/work-orders/:id              one job (8.4.1)
 *   POST /api/crew/work-orders/:id/accept       (8.3.3)
 *   POST /api/crew/work-orders/:id/start        (8.3.4)
 *   POST /api/crew/work-orders/:id/complete     body { notes, photos } (8.3.6, 8.3.10)
 *   POST /api/crew/work-orders/:id/issue        body { reason } (8.3.8)
 *   POST /api/crew/work-orders/:id/resume       (8.3.9)
 *
 * **The filter is applied by the controller, not here and not in the browser.** 8.4.1 is an access
 * rule rather than a display preference: a client-side filter over every work order would ship
 * other crews' assignments to the browser and rely on the interface to hide them, which 2.3.5
 * forbids and 2.3.6 says may never be the enforcement point.
 *
 * Every state change is its own POST, named for the transition. A single endpoint taking a target
 * status would make this file the place where "which moves are legal" is decided, and that belongs
 * to `WorkOrderTransitionTable` — the reason `WorkOrder.status` has no public setter at all.
 */
import { RouteHandler, Request, Response } from './RouteHandler';
import { AccessControlService } from '../../control/AccessControlService';
import { DispatchController } from '../../control/DispatchController';
import { TransitionRefused, WorkOrderLifecycleController } from '../../control/WorkOrderLifecycleController';
import { WorkOrder } from '../../entity/WorkOrder';
import { CompletionEvidence } from '../../entity/CompletionEvidence';

interface CompleteBody {
  notes?: string;
  /** 8.3.10 — the storage keys of photographs already uploaded. At least one is required. */
  photoKeys?: string[];
}

export class CrewRoutes extends RouteHandler {
  constructor(
    ac: AccessControlService,
    private readonly dispatch: DispatchController,
    private readonly lifecycle: WorkOrderLifecycleController,
  ) {
    super(ac);
  }

  routes(): string[] {
    return ['/api/crew/work-orders', '/api/crew/work-orders/:id'];
  }

  override writeRoutes(): string[] {
    return [
      '/api/crew/work-orders/:id/accept',
      '/api/crew/work-orders/:id/start',
      '/api/crew/work-orders/:id/complete',
      '/api/crew/work-orders/:id/issue',
      '/api/crew/work-orders/:id/resume',
    ];
  }

  async handle(req: Request, res: Response): Promise<void> {
    const id = req.params.id ?? '';
    try {
      const principal = await this.resolvePrincipal(req);
      switch (req.params.route) {
        case '/api/crew/work-orders': {
          const filter = CrewRoutes.filterFrom(req.params.filter);
          const jobs = await this.dispatch.crewView(principal, filter);
          res.json({ filter, workOrders: jobs.map((job) => CrewRoutes.card(job)) });
          return;
        }

        case '/api/crew/work-orders/:id': {
          // Read through `crewView` rather than by id, so 8.4.1 is enforced by the same code path
          // that enforces it for the list. Fetching by id and then checking the assignee here
          // would put the access rule in a boundary class.
          const job = (await this.dispatch.crewView(principal, 'All')).find((w) => w.id === id);
          if (job === undefined) {
            // 2.3.7 — the same answer whether it is not theirs or does not exist.
            res.status(404).json({ error: 'no such work order', remedy: 'check the identifier' });
            return;
          }
          res.json({ workOrder: CrewRoutes.card(job) });
          return;
        }

        case '/api/crew/work-orders/:id/accept':
          res.json(CrewRoutes.card(await this.lifecycle.accept(id, principal)));
          return;

        case '/api/crew/work-orders/:id/start':
          res.json(CrewRoutes.card(await this.lifecycle.start(id, principal)));
          return;

        case '/api/crew/work-orders/:id/complete': {
          const body = (req.body ?? {}) as CompleteBody;
          const job = (await this.dispatch.crewView(principal, 'All')).find((w) => w.id === id);
          if (job === undefined) {
            res.status(404).json({ error: 'no such work order', remedy: 'check the identifier' });
            return;
          }
          const evidence = new CompletionEvidence();
          evidence.workOrderId = id;
          evidence.completedAt = new Date();
          // 8.3.7 — what was actually done. Taken from the order rather than from the request, so
          // a crew member cannot record a task type nobody asked for.
          evidence.taskPerformed = job.taskType;
          evidence.notes = body.notes ?? '';
          evidence.photoKeys = body.photoKeys ?? [];
          evidence.rejectionReason = null;
          res.json(CrewRoutes.card(await this.lifecycle.complete(id, evidence, principal)));
          return;
        }

        case '/api/crew/work-orders/:id/issue': {
          const reason = ((req.body ?? {}) as { reason?: string }).reason ?? '';
          res.json(CrewRoutes.card(await this.lifecycle.raiseIssue(id, reason, principal)));
          return;
        }

        case '/api/crew/work-orders/:id/resume':
          res.json(CrewRoutes.card(await this.lifecycle.resume(id, principal)));
          return;

        default:
          res.status(404).json({ error: 'no such route', remedy: 'check the path' });
      }
    } catch (error) {
      if (error instanceof TransitionRefused) {
        // 8.3.16 — name the rule that refused and the state the job is actually in. "Cannot
        // complete" alone leaves a crew member on a roadside guessing.
        res.status(422).json({ error: error.reason, remedy: `the work order is ${error.from}` });
        return;
      }
      this.fail(res, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** 8.4.6 — the three filters, plus All. An unknown value is All rather than an error. */
  private static filterFrom(raw: string | undefined): 'Today' | 'Upcoming' | 'Completed' | 'All' {
    return raw === 'Today' || raw === 'Upcoming' || raw === 'Completed' ? raw : 'All';
  }

  private static card(order: WorkOrder): Record<string, unknown> {
    return {
      id: order.id,
      clusterId: order.clusterId,
      taskType: order.taskType,
      status: order.currentStatus(),
      scheduledDate: order.scheduledDate,
      priority: order.priority,
      instructions: order.instructions,
      startedAt: order.startedAt,
      issueFlag: order.issueFlag,
      issueReason: order.issueReason,
    };
  }
}
