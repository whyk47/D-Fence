/**
 * D-Fence — AuthRoutes.
 * Stereotype: <<boundary>>. Traces: 2.1.1–2.1.12, 10.3.3, 10.5.3, 10.6.4.
 *
 * Routes:
 *   POST /api/auth/register         email + password (2.1.1–2.1.5)
 *   POST /api/auth/signin           issues a bearer token (2.1.7, 2.1.8)
 *   POST /api/auth/signout          terminates it (2.1.12)
 *   POST /api/auth/reset/request    (2.1.11)
 *   POST /api/auth/reset/complete   (2.1.11)
 *   GET  /api/auth/me               who the bearer token belongs to
 *
 * These are the only handlers that do **not** resolve a principal first: three of them exist
 * precisely so that a caller who has none can get one. `me` and `signout` do, and get it the same
 * way every other route does.
 */
import { RouteHandler, Request, Response } from './RouteHandler';
import { AccessControlService } from '../../control/AccessControlService';
import { AuthenticationController, AuthenticationRefused } from '../../control/AuthenticationController';

interface CredentialBody {
  email?: string;
  password?: string;
  token?: string;
}

export class AuthRoutes extends RouteHandler {
  constructor(
    ac: AccessControlService,
    private readonly authentication: AuthenticationController,
  ) {
    super(ac);
  }

  routes(): string[] {
    return ['/api/auth/me'];
  }

  override writeRoutes(): string[] {
    return [
      '/api/auth/register',
      '/api/auth/signin',
      '/api/auth/signout',
      '/api/auth/reset/request',
      '/api/auth/reset/complete',
    ];
  }

  async handle(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as CredentialBody;
    try {
      switch (req.params.route) {
        case '/api/auth/register': {
          const account = await this.authentication.register(body.email ?? '', body.password ?? '');
          // 2.1.6 — registering does not sign you in; the verification link comes first, and the
          // response says so rather than leaving the client to guess why there is no token.
          res.status(201).json({
            accountId: account.id,
            role: account.role,
            next: 'check your email for the verification link before signing in',
          });
          return;
        }
        case '/api/auth/signin': {
          const { session, principal } = await this.authentication.signIn(body.email ?? '', body.password ?? '');
          res.json({ token: session.token, role: principal.role, accountId: principal.accountId });
          return;
        }
        case '/api/auth/signout':
          await this.authentication.signOut(RouteHandler.bearerOf(req) ?? '');
          res.json({ signedOut: true });
          return;
        case '/api/auth/reset/request':
          await this.authentication.requestReset(body.email ?? '');
          // Always the same answer, whether or not the address exists (2.1.11).
          res.json({ sent: true, next: 'if that address is registered, a reset link is on its way' });
          return;
        case '/api/auth/reset/complete':
          await this.authentication.completeReset(body.token ?? '', body.password ?? '');
          res.json({ reset: true, next: 'sign in with your new password' });
          return;
        case '/api/auth/me': {
          const principal = await this.resolvePrincipal(req);
          res.json({ accountId: principal.accountId, role: principal.role, sessionId: principal.sessionId });
          return;
        }
        default:
          res.status(404).json({ error: 'no such route', remedy: 'check the path' });
      }
    } catch (error) {
      if (error instanceof AuthenticationRefused) {
        // 401, not 400: the request was well formed and the credentials were not accepted. The
        // reason is already worded for the user by the control layer (10.5.3).
        res.status(401).json({ error: error.reason, remedy: 'correct the details and try again' });
        return;
      }
      this.fail(res, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
