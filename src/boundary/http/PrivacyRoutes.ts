/**
 * D-Fence — attribution and account deletion.
 * Stereotype: <<boundary>>. Traces: 10.4.3, 10.4.4, 10.4.5.
 *
 * Routes:
 *   GET  /api/attribution              every source's required attribution (10.4.4, 10.4.5)
 *   POST /api/account/delete           the caller deletes their own account and data (10.4.3)
 *
 * `/api/attribution` is deliberately **unauthenticated**: a licence obligation that only appears
 * once you sign in is not discharged. It is also the one endpoint here a screen calls on every
 * page, so it resolves no session and reads no store.
 */
import { RouteHandler, Request, Response } from './RouteHandler';
import { AccessControlService } from '../../control/AccessControlService';
import { PrivacyController, DELETION_DEADLINE_DAYS } from '../../control/PrivacyController';
import { Attribution, ATTRIBUTIONS } from '../../config/Attribution';

export class PrivacyRoutes extends RouteHandler {
  constructor(
    ac: AccessControlService,
    private readonly privacy: PrivacyController,
  ) {
    super(ac);
  }

  routes(): string[] {
    return ['/api/attribution'];
  }

  override writeRoutes(): string[] {
    return ['/api/account/delete'];
  }

  async handle(req: Request, res: Response): Promise<void> {
    try {
      if (req.params.route === '/api/attribution') {
        const screenId = req.params.screenId;
        res.json({
          // A screen id narrows it; without one the caller gets the whole registry, which is what
          // a footer on an unknown screen should show rather than nothing.
          attributions: screenId === undefined ? [...ATTRIBUTIONS] : Attribution.forScreen(screenId),
          footer: screenId === undefined ? undefined : Attribution.footerFor(screenId),
          // 10.4.5 — the exception is served, not hidden. A reader of this endpoint can see that
          // one source needs a credential and which one.
          credentialedSources: Attribution.credentialedSources().map((a) => a.source),
        });
        return;
      }

      const principal = await this.resolvePrincipal(req);
      const outcome = await this.privacy.requestDeletion(principal);
      res.json({
        deleted: true,
        // 10.5.3 — what actually happened, itemised. "Your account has been deleted" is not an
        // answer to "what did you do with my reports", and the reports are the surprising part.
        outcome,
        note:
          `Your saved locations, alert subscriptions and email address have been erased. ` +
          `${outcome.reportsDissociated} report(s) you filed remain, with your name removed: they ` +
          `record work that was scheduled and carried out. Completed within the ` +
          `${DELETION_DEADLINE_DAYS}-day limit.`,
      });
    } catch (error) {
      this.fail(res, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
