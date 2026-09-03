/**
 * D-Fence — AdminRoutes.
 * Stereotype: <<boundary>>. Traces: 2.2.3, 2.2.4, 2.3.4, 2.4.1.
 *
 * Routes:
 *   GET  /api/ops/staff                    the staff list (2.2.3, 2.2.4)
 *   GET  /api/ops/staff/crew               assignable crew, active only (8.2.2, 8.2.3)
 *   POST /api/ops/staff                    create a manager or crew account (2.2.3)
 *   POST /api/ops/staff/:id/deactivate     (2.2.4, 2.2.5)
 *   POST /api/ops/staff/:id/reactivate     (2.2.4)
 *
 * Every path here is manager-only, and none of them checks that: `StaffAccountController` calls
 * `AccessControlService` first. A boundary class that repeated the role test would be a second
 * place for 2.2.3 to live, and the one that drifts.
 */
import { RouteHandler, Request, Response } from './RouteHandler';
import { AccessControlService } from '../../control/AccessControlService';
import { StaffAccountController } from '../../control/StaffAccountController';
import { AuthenticationRefused } from '../../control/AuthenticationController';
import { Role } from '../../entity/enums';

interface StaffBody {
  email?: string;
  password?: string;
  role?: string;
}

export class AdminRoutes extends RouteHandler {
  constructor(
    ac: AccessControlService,
    private readonly staff: StaffAccountController,
  ) {
    super(ac);
  }

  routes(): string[] {
    return ['/api/ops/staff/crew', '/api/ops/staff'];
  }

  override writeRoutes(): string[] {
    return ['/api/ops/staff', '/api/ops/staff/:id/deactivate', '/api/ops/staff/:id/reactivate'];
  }

  async handle(req: Request, res: Response): Promise<void> {
    const id = req.params.id ?? '';
    try {
      const principal = await this.resolvePrincipal(req);
      switch (req.params.route) {
        case '/api/ops/staff': {
          if (req.body === undefined || req.body === null || Object.keys(req.body as object).length === 0) {
            res.json({ staff: (await this.staff.listStaff(principal)).map(AdminRoutes.project) });
            return;
          }
          const body = req.body as StaffBody;
          const role = Object.values(Role).find((r) => r === body.role);
          if (role === undefined) {
            throw new AuthenticationRefused(`${String(body.role)} is not one of the three roles (2.2.1)`);
          }
          const account = await this.staff.createStaffAccount(body.email ?? '', role, body.password ?? '', principal);
          res.status(201).json(AdminRoutes.project(account));
          return;
        }
        case '/api/ops/staff/crew':
          res.json({ crew: (await this.staff.assignableCrew(principal)).map(AdminRoutes.project) });
          return;
        case '/api/ops/staff/:id/deactivate': {
          const result = await this.staff.deactivateAccount(id, principal);
          // The session count is stated, not hidden: a manager deactivating someone mid-shift needs
          // to know whether they were signed in at the time (2.2.5).
          res.json({ ...AdminRoutes.project(result.account), sessionsEnded: result.sessionsEnded });
          return;
        }
        case '/api/ops/staff/:id/reactivate':
          res.json(AdminRoutes.project(await this.staff.reactivateAccount(id, principal)));
          return;
        default:
          res.status(404).json({ error: 'no such route', remedy: 'check the path' });
      }
    } catch (error) {
      if (error instanceof AuthenticationRefused) {
        res.status(400).json({ error: error.reason, remedy: 'correct the details and try again' });
        return;
      }
      this.fail(res, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Never the `authUserId`: it is the provider's credential handle, and no screen needs it. */
  private static project(account: { id: string; email: string; role: Role; isActive: boolean; createdAt: Date }): {
    accountId: string;
    email: string;
    role: Role;
    isActive: boolean;
    createdAt: Date;
  } {
    return {
      accountId: account.id,
      email: account.email,
      role: account.role,
      isActive: account.isActive,
      createdAt: account.createdAt,
    };
  }
}
