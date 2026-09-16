/**
 * D-Fence — ReferralRoutes and the pest reference.
 * Stereotype: <<boundary>>. Traces: 8.6.1–8.6.9, 11.2.27, 11.2.28, 4.2.3, 4.2.8, 4.3.9, 10.5.3.
 *
 * Routes:
 *   GET  /api/pests                        the pest reference: every covered pest, its authority
 *                                          and its published contact number (11.2.27)
 *   GET  /api/ops/referrals/:id            the referral view for one report (11.2.28)
 *   POST /api/ops/referrals/:id/refer      body { reason } (8.6.1, 8.6.4)
 *   POST /api/ops/referrals/:id/outcome    body { outcome }; :id is the REFERRAL id (8.6.8)
 *
 * `/api/pests` is readable by any signed-in role on purpose. A resident who has just seen a snake in
 * their kitchen needs the AVS number faster than they need a report form (11.2.27), and the pest
 * catalogue contains nothing private: it is severity, tier, authority and a published number.
 */
import { RouteHandler, Request, Response } from './RouteHandler';
import { AccessControlService } from '../../control/AccessControlService';
import { ReferralController, ReferralRefused } from '../../control/ReferralController';
import { ReportTransitionRefused } from '../../control/ReportLifecycleController';
import { ConfigSet } from '../../config/ConfigSet';

export class ReferralRoutes extends RouteHandler {
  constructor(
    ac: AccessControlService,
    private readonly referrals: ReferralController,
    private readonly config: ConfigSet,
  ) {
    super(ac);
  }

  routes(): string[] {
    return ['/api/pests', '/api/ops/referrals/:id'];
  }

  override writeRoutes(): string[] {
    return ['/api/ops/referrals/:id/refer', '/api/ops/referrals/:id/outcome'];
  }

  async handle(req: Request, res: Response): Promise<void> {
    const id = req.params.id ?? '';
    try {
      const principal = await this.resolvePrincipal(req);
      switch (req.params.route) {
        case '/api/pests':
          res.json({ pests: this.pestReference() });
          return;
        case '/api/ops/referrals/:id':
          res.json(await this.referrals.view(id, principal));
          return;
        case '/api/ops/referrals/:id/refer': {
          const reason = ((req.body ?? {}) as { reason?: string }).reason ?? '';
          const referral = await this.referrals.refer(id, reason, principal);
          res.status(201).json({
            referralId: referral.id,
            destination: referral.destinationAuthority,
            referredAt: referral.referredAt.toISOString(),
          });
          return;
        }
        case '/api/ops/referrals/:id/outcome': {
          const outcome = ((req.body ?? {}) as { outcome?: string }).outcome ?? '';
          const referral = await this.referrals.recordOutcome(id, outcome, principal);
          res.json({ referralId: referral.id, outcome: referral.outcome, closed: referral.isClosed() });
          return;
        }
        default:
          res.status(404).json({ error: 'no such route', remedy: 'check the path' });
      }
    } catch (error) {
      if (error instanceof ReferralRefused) {
        // 10.5.3 — the cause and the remedy, both already phrased for the manager.
        res.status(422).json({ error: error.reason, remedy: error.remedy });
        return;
      }
      if (error instanceof ReportTransitionRefused) {
        res.status(422).json({ error: error.reason, remedy: `the report is ${error.from}` });
        return;
      }
      this.fail(res, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 11.2.27 — the reference table, sorted by severity so the most serious pests are at the top.
   *
   * The severity multiplier is included (4.2.8) and so is the evidence tier (4.3.9). Both are shown
   * rather than hidden because both are claims the system makes about itself: a tier C number is a
   * weaker statement than a tier A one, and a reader entitled to the number is entitled to that.
   */
  private pestReference(): Array<Record<string, unknown>> {
    return [...this.config.pestProfiles.values()]
      .sort(
        (a, b) =>
          b.severityMultiplier - a.severityMultiplier || a.pestType.localeCompare(b.pestType),
      )
      .map((p) => ({
        pestType: p.pestType,
        pestClass: p.pestClass,
        evidenceTier: p.evidenceTier,
        severityMultiplier: p.severityMultiplier,
        authority: p.dispatchAuthority,
        contactNumber: p.authorityContactNumber,
        /** 8.1.14 — whether this pest is referred rather than dispatched to a crew. */
        referred: p.isReferrable(),
      }));
  }
}
