/**
 * D-Fence — referral to an external authority.
 * Stereotype: <<control>>. Traces: 8.6.1–8.6.11, 8.1.14, 8.1.15, 4.2.3, 11.2.28.
 *
 * The control class for the thing D-Fence declines to do. A wildlife case is not dispatched to a
 * Cleaning Crew — 8.1.14 refuses the work order — and this is what happens instead: the case goes to
 * the authority the pest profile names, the resident is told who it went to, and the outcome comes
 * back and closes the report.
 *
 * **What it deliberately does not do.** It writes no `WorkOrder` (8.6.10) and no `TreatmentRecord`
 * (8.6.11). The temptation is real — the case is closed, after all — and giving in to it would tell
 * `DaysSinceLastTreatment` that a locality was treated when nobody treated it, which corrupts the
 * 4.1.17 feedback loop that makes a score fall after work is done.
 */
import { randomUUID } from 'node:crypto';
import { PestType, ReportStatus, Role } from '../entity/enums';
import { Uuid } from '../entity/valueTypes';
import { Referral } from '../entity/Referral';
import { Report } from '../entity/Report';
import { PestProfile } from '../entity/PestProfile';
import { ReferralStore, ReportStore, AuditStore } from '../ports/Stores';
import { ConfigSet } from '../config/ConfigSet';
import { AccessControlService } from './AccessControlService';
import { Principal } from './Principal';
import { ReportLifecycleController } from './ReportLifecycleController';

/** 8.6.4 — the minimum a reason can be and still be one. */
const MIN_REASON_CHARS = 10;

/** A referral refused, with the cause the manager needs (10.5.3). */
export class ReferralRefused extends Error {
  constructor(readonly reason: string, readonly remedy: string) {
    super(reason);
    this.name = 'ReferralRefused';
  }
}

export interface ReferralView {
  reportId: Uuid;
  pestType: PestType;
  destinationAuthority: string;
  destinationContactNumber: string;
  /** Null when the report has not been referred yet — the screen offers the action instead. */
  referral: {
    id: Uuid;
    referredAt: string;
    reason: string;
    outcome: string | null;
    outcomeRecordedAt: string | null;
  } | null;
}

export class ReferralController {
  constructor(
    private readonly ac: AccessControlService,
    private readonly reports: ReportStore,
    private readonly referrals: ReferralStore,
    private readonly lifecycle: ReportLifecycleController,
    private readonly config: ConfigSet,
    private readonly audit: AuditStore | null = null,
  ) {}

  /** 8.6.2, 8.6.3 — who this pest goes to, and on what number. Read, never chosen. */
  destinationFor(pestType: PestType): PestProfile {
    const profile = this.config.pestProfiles.get(pestType);
    if (profile === undefined || profile.dispatchAuthority.trim() === '') {
      // 6.10.EX.2 — an unconfigured authority blocks the referral rather than inventing one.
      throw new ReferralRefused(
        `no dispatch authority is configured for ${pestType}`,
        'add one to config/pests.default.json before referring this pest (4.2.3, 8.6.2)',
      );
    }
    return profile;
  }

  /** 11.2.28 — what the Referral screen renders, whether or not a referral exists yet. */
  async view(reportId: Uuid, by: Principal): Promise<ReferralView> {
    await this.ac.authorise(by, 'report:moderate', { kind: 'report', id: reportId });
    const report = await this.require(reportId);
    const profile = this.destinationFor(report.pestType);
    const existing = await this.referrals.findByReport(reportId);
    return {
      reportId,
      pestType: report.pestType,
      destinationAuthority: profile.dispatchAuthority,
      destinationContactNumber: profile.authorityContactNumber,
      referral:
        existing === null
          ? null
          : {
              id: existing.id,
              referredAt: existing.referredAt.toISOString(),
              reason: existing.reason,
              outcome: existing.outcome,
              outcomeRecordedAt: existing.outcomeRecordedAt?.toISOString() ?? null,
            },
    };
  }

  /**
   * 8.6.1, 8.6.4, 8.6.5 — refer a verified report, and set it Actioned.
   *
   * 4.4.1's reading applies here too: only a **verified** report may be referred. Referring an
   * unmoderated one would send an agency out on a report nobody has looked at, which is worse than
   * doing nothing.
   */
  async refer(reportId: Uuid, reason: string, by: Principal, now = new Date()): Promise<Referral> {
    await this.ac.authorise(by, 'report:moderate', { kind: 'report', id: reportId });
    const report = await this.require(reportId);
    const profile = this.destinationFor(report.pestType);

    if (!report.isVerified()) {
      throw new ReferralRefused(
        `the report is ${report.currentStatus()}, not Verified`,
        'verify the report before referring it (8.6.1)',
      );
    }
    if ((await this.referrals.findByReport(reportId)) !== null) {
      throw new ReferralRefused(
        'this report has already been referred',
        'record the outcome of the existing referral instead (8.6.8)',
      );
    }
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON_CHARS) {
      // 8.6.4 asks for a reason, and a reason is what the authority reads. "n/a" is not one.
      throw new ReferralRefused(
        `a referral needs a reason of at least ${MIN_REASON_CHARS} characters`,
        'say what was reported and why it is for this authority (8.6.4)',
      );
    }

    const referral = new Referral();
    referral.id = randomUUID();
    referral.reportId = reportId;
    referral.destinationAuthority = profile.dispatchAuthority;
    referral.destinationContactNumber = profile.authorityContactNumber;
    referral.referredAt = now;
    referral.referredBy = by.accountId;
    referral.reason = trimmed;
    const saved = await this.referrals.save(referral);

    // 8.6.5 — Actioned, through the lifecycle controller, so 5.2.x's transition rules and the audit
    // trail apply exactly as they do to a dispatched report. No work order and no treatment record
    // is written here (8.6.10, 8.6.11).
    //
    // The actor is SYSTEM, not the manager, and that matches the table rather than working around
    // it: 5.2.6's Verified -> Actioned rule is SYSTEM because the status change is a *consequence*
    // of an action, not the action itself. Raising a work order works the same way. Who referred it
    // is recorded on the Referral (8.6.4) and in the audit trail, which is where that fact belongs.
    //
    // 8.6.6 — the resident is told, and told *who it went to*. The notice rides on this transition
    // rather than being sent separately because 5.2.8 already fires here: a second notification
    // would give the resident two messages for one event, one of them the default "has been
    // scheduled for treatment", which is exactly the false sentence this replaces.
    await this.lifecycle.transition(reportId, ReportStatus.Actioned, 'SYSTEM', {
      moderatorId: by.accountId,
      reason: trimmed,
      at: now,
      residentNotice: ReferralController.referralNotice(profile),
    });
    await this.record(by, 'report:refer', reportId);
    return saved;
  }

  /** 8.6.8, 8.6.9 — the outcome comes back, and the report closes. */
  async recordOutcome(
    referralId: Uuid,
    outcome: string,
    by: Principal,
    now = new Date(),
  ): Promise<Referral> {
    const referral = await this.referrals.findById(referralId);
    if (referral === null) {
      throw new ReferralRefused('no such referral', 'check the referral id');
    }
    await this.ac.authorise(by, 'report:moderate', { kind: 'report', id: referral.reportId });
    if (referral.isClosed()) {
      throw new ReferralRefused(
        'an outcome is already recorded for this referral',
        'the report is closed (8.6.9)',
      );
    }
    if (outcome.trim() === '') {
      throw new ReferralRefused('an outcome cannot be empty', 'say what the authority did (8.6.8)');
    }
    referral.outcome = outcome.trim();
    referral.outcomeRecordedAt = now;
    const saved = await this.referrals.save(referral);
    // 8.6.9 — the outcome closes the report, through the same lifecycle rules a dispatched report
    // follows. Nothing here writes a TreatmentRecord (8.6.11).
    // The notice is overridden here for the same reason it is in `refer`: the default Closed
    // wording is "has been treated and closed", and nobody from D-Fence treated anything. 8.6.11
    // says no TreatmentRecord is written, and a message claiming a treatment is the same untruth
    // told to the resident instead of to the database.
    await this.lifecycle.transition(referral.reportId, ReportStatus.Closed, 'SYSTEM', {
      moderatorId: by.accountId,
      reason: referral.outcome ?? '',
      at: now,
      residentNotice:
        `was closed by ${referral.destinationAuthority}, who reported: ${referral.outcome ?? ''}`,
    });
    await this.record(by, 'referral:outcome', referral.reportId);
    return saved;
  }

  /**
   * 8.6.6 — the sentence the resident receives when their report is referred.
   *
   * It names the authority, which is the whole requirement, and gives the number beside it so the
   * resident can follow the case up with the body that now holds it. D-Fence cannot answer for a
   * referred case, and a message that does not say who can is a dead end.
   *
   * Static and public so the wording is testable without a store, a principal or a transition.
   */
  static referralNotice(profile: PestProfile): string {
    return (
      `has been referred to ${profile.dispatchAuthority}, who handle ${profile.pestType} cases. ` +
      `You can reach them on ${profile.authorityContactNumber}`
    );
  }

  /** 8.6.7 — the dashboard needs to tell a referred report from one with an open work order. */
  async openReferrals(by: Principal): Promise<Referral[]> {
    await this.ac.authorise(by, 'report:moderate', { kind: 'report' });
    return this.referrals.findOpen();
  }

  private async require(reportId: Uuid): Promise<Report> {
    const report = await this.reports.findById(reportId);
    if (report === null) {
      throw new ReferralRefused('no such report', 'check the report id');
    }
    return report;
  }

  private async record(by: Principal, action: string, targetId: Uuid): Promise<void> {
    if (this.audit === null || by.role !== Role.OperationsManager) {
      return;
    }
    await this.audit.appendAction(by.accountId, action, 'Report', targetId);
  }
}
