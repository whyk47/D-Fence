/**
 * D-Fence — AlertRoutes.
 * Stereotype: <<boundary>>. Traces: 6.1.1, 6.1.3, 6.1.4, 6.1.7, 6.1.10, 2.3.1.
 *
 * Routes:
 *   GET  /api/alerts                       the caller's recent alerts (6.1.10)
 *   POST /api/alerts/link                  issue a single-use Telegram code (6.1.7)
 *   POST /api/alerts/link/claim            the bot presents the code and its chat id (6.1.7)
 *   POST /api/locations/:id/alerts         enable, disable, set the growth threshold (6.1.1, 6.1.3)
 *
 * `link/claim` is the one route here a **resident** does not call — the bot does, on their behalf,
 * and it therefore carries no session. The code itself is the credential, which is exactly why
 * 6.1.7 makes it single-use and short-lived.
 */
import { RouteHandler, Request, Response } from './RouteHandler';
import { AccessControlService } from '../../control/AccessControlService';
import { NotificationController } from '../../control/NotificationController';
import { AlertPreferenceController, AlertPreferenceRejected } from '../../control/AlertPreferenceController';

export class AlertRoutes extends RouteHandler {
  constructor(
    ac: AccessControlService,
    private readonly notifications: NotificationController,
    private readonly preferences: AlertPreferenceController,
  ) {
    super(ac);
  }

  routes(): string[] {
    return ['/api/alerts'];
  }

  override writeRoutes(): string[] {
    return ['/api/alerts/link', '/api/alerts/link/claim', '/api/locations/:id/alerts'];
  }

  async handle(req: Request, res: Response): Promise<void> {
    const id = req.params.id ?? '';
    try {
      // Claiming a link code is the bot's call, not a resident's, so it resolves no session. The
      // code is the credential; 6.1.7's fifteen minutes and single use are what make that safe.
      if (req.params.route === '/api/alerts/link/claim') {
        const body = (req.body ?? {}) as { code?: string; chatId?: string };
        const accountId = await this.notifications.claimLinkCode(body.code ?? '', body.chatId ?? '');
        if (accountId === null) {
          res.status(400).json({ error: 'that code is not valid, or has expired', remedy: 'request a new code' });
          return;
        }
        res.json({ linked: true, accountId });
        return;
      }

      const principal = await this.resolvePrincipal(req);
      switch (req.params.route) {
        case '/api/alerts': {
          const mine = (await this.notifications.recentDeliveries(200)).filter(
            (a) => a.accountId === principal.accountId, // 2.3.1 — a resident's own alerts only
          );
          res.json({
            alerts: mine.slice(0, 50).map((a) => ({
              trigger: a.triggerType,
              outcome: a.outcome,
              sentAt: a.sentAt,
              attempts: a.attempts,
              message: a.payload,
            })),
          });
          return;
        }
        case '/api/alerts/link': {
          const issued = this.notifications.issueLinkCode(principal.accountId);
          res.json({
            code: issued.code,
            expiresAt: issued.expiresAt,
            next: 'send this code to the D-Fence bot on Telegram within 15 minutes',
          });
          return;
        }
        case '/api/locations/:id/alerts': {
          const body = (req.body ?? {}) as { enabled?: boolean; growthThreshold?: number; triggers?: string[] };
          const subscription = await this.preferences.update(id, body, principal);
          res.json({
            savedLocationId: subscription.savedLocationId,
            enabled: subscription.enabled,
            growthThreshold: subscription.growthThreshold,
            triggers: subscription.triggers,
          });
          return;
        }
        default:
          res.status(404).json({ error: 'no such route', remedy: 'check the path' });
      }
    } catch (error) {
      if (error instanceof AlertPreferenceRejected) {
        res.status(400).json({ error: error.reason, remedy: 'correct the details and try again' });
        return;
      }
      this.fail(res, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
