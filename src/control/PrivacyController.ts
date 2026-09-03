/**
 * D-Fence — account deletion and the personal-data inventory.
 * Stereotype: <<control>>. Traces: 10.4.1, 10.4.2, 10.4.3, 2.4.1.
 *
 * 10.4.3 gives seven days to delete a user's personal data after they ask. Seven days is a
 * **deadline, not a delay** — there is no reason to wait, and the only thing the window buys is
 * room for a scheduled job to run. So a request purges immediately and the window is what the
 * deadline check enforces if a purge is ever deferred.
 *
 * **The hard part is not deleting; it is deciding what counts as personal data.** A resident's
 * reports are not theirs alone: a verified report is operational evidence that a cleaning crew was
 * sent somewhere, it sits in the 4.1.3 driver, and 8.1.13 links it to a work order. Deleting those
 * would rewrite an operational history that other people acted on. So reports are **dissociated,
 * not destroyed** — the reporter id is severed and the report survives without an owner. That is
 * the same line 10.4.1 already draws for a public projection, applied permanently.
 *
 * What is genuinely the person's own — email address, saved locations, alert subscriptions, the
 * Telegram chat link — is destroyed outright. 10.4.2 says the system stores nothing beyond email,
 * role and saved locations, and `personalDataInventory()` is that claim made checkable rather than
 * asserted: if a future entity starts holding a phone number, the test that reads this list is the
 * one that should fail.
 */
import { Uuid } from '../entity/valueTypes';
import { AccountStore, AlertSubscriptionStore, AuditStore, ReportStore, SavedLocationStore } from '../ports/Stores';
import { AccessControlService } from './AccessControlService';
import { Principal } from './Principal';

/** 10.4.3. The outer bound, not the target. */
export const DELETION_DEADLINE_DAYS = 7;

export interface DeletionRequest {
  accountId: Uuid;
  requestedAt: Date;
  completedAt: Date | null;
}

export interface DeletionOutcome {
  accountId: Uuid;
  savedLocationsDeleted: number;
  subscriptionsDeleted: number;
  reportsDissociated: number;
  emailErased: boolean;
  telegramUnlinked: boolean;
}

/**
 * 10.4.2 — every field in the system that identifies a person, and what becomes of it on deletion.
 *
 * A list rather than a comment, so a test can read it. `retained` marks the two things that survive
 * a deletion and says why, because an inventory that only listed what is destroyed would be a
 * misleading answer to "what do you hold about me".
 */
export const PERSONAL_DATA_INVENTORY: ReadonlyArray<{
  entity: string;
  field: string;
  disposition: 'erased' | 'deleted' | 'dissociated' | 'retained';
  note: string;
}> = [
  { entity: 'Account', field: 'email', disposition: 'erased', note: 'replaced with a tombstone address' },
  { entity: 'Account', field: 'telegramChatId', disposition: 'erased', note: 'the chat link is severed' },
  { entity: 'Account', field: 'authUserId', disposition: 'erased', note: 'the provider identity is disabled' },
  { entity: 'SavedLocation', field: 'all', disposition: 'deleted', note: "a resident's home address is theirs alone" },
  { entity: 'AlertSubscription', field: 'all', disposition: 'deleted', note: 'follows the location it belongs to' },
  {
    entity: 'Report',
    field: 'reporterId',
    disposition: 'dissociated',
    note: 'the report is operational evidence others acted on; the owner is severed, the report stays',
  },
  {
    entity: 'Account',
    field: 'role',
    disposition: 'retained',
    note: '10.4.2 permits it, and an audit row with no role is unreadable',
  },
  {
    entity: 'AuditRecord',
    field: 'accountId',
    disposition: 'retained',
    note: '2.4.2 forbids modifying an audit record; the id survives as an opaque key to a deleted account',
  },
];

/** What a deletion needs from the provider: the credential, which this system does not own. */
export interface IdentityProvider {
  disableUser(authUserId: string): Promise<void>;
}

export class PrivacyController {
  constructor(
    private readonly ac: AccessControlService,
    private readonly accounts: AccountStore,
    private readonly locations: SavedLocationStore,
    private readonly reports: ReportStore | null = null,
    private readonly subscriptions: AlertSubscriptionStore | null = null,
    private readonly provider: IdentityProvider | null = null,
    private readonly audit: AuditStore | null = null,
  ) {}

  private readonly requests = new Map<Uuid, DeletionRequest>();

  /**
   * 10.4.3 — a person asks for their data to be deleted, and it is deleted.
   *
   * Ownership-scoped: `accountId` is the caller's own, which is the only account a Resident may
   * ask about (2.3.1). A manager deleting somebody else's account is `StaffAccountController`'s
   * deactivation path and a different act with a different rule.
   */
  async requestDeletion(by: Principal, now = new Date()): Promise<DeletionOutcome> {
    await this.ac.authorise(by, 'savedLocation:write', {
      kind: 'savedLocation',
      id: by.accountId,
      ownerId: by.accountId,
    });
    this.requests.set(by.accountId, { accountId: by.accountId, requestedAt: now, completedAt: null });
    const outcome = await this.purge(by.accountId, now);
    // 2.4.1 — the one row that must survive the person it describes, so a deletion can be shown to
    // have happened. It names the account id and nothing else about them.
    await this.audit?.appendAction(by.accountId, 'account:deleteRequested', 'Account', by.accountId);
    return outcome;
  }

  /**
   * The deletion itself. Order matters and is the reverse of creation: the things that point at an
   * account go first, so a crash halfway leaves orphans that still belong to a live account rather
   * than subscriptions pointing at an account that no longer exists.
   */
  async purge(accountId: Uuid, now = new Date()): Promise<DeletionOutcome> {
    const outcome: DeletionOutcome = {
      accountId,
      savedLocationsDeleted: 0,
      subscriptionsDeleted: 0,
      reportsDissociated: 0,
      emailErased: false,
      telegramUnlinked: false,
    };

    for (const location of await this.locations.findForAccount(accountId)) {
      outcome.subscriptionsDeleted += (await this.subscriptions?.deleteForLocation(location.id)) ?? 0;
      await this.locations.delete(location.id);
      outcome.savedLocationsDeleted += 1;
    }

    // Dissociated, not deleted. See the class note: a verified report is evidence a crew was sent.
    for (const report of (await this.reports?.findByReporter(accountId)) ?? []) {
      report.reporterId = null;
      await this.reports?.save(report);
      outcome.reportsDissociated += 1;
    }

    const account = await this.accounts.findById(accountId);
    if (account !== null) {
      // A tombstone rather than an empty string: `findByEmail` must not start matching every
      // deleted account on '', and 2.1.4's duplicate check reads that index.
      account.email = `deleted-${accountId}@invalid`;
      account.telegramChatId = null;
      account.isActive = false;
      account.emailVerified = false;
      outcome.emailErased = true;
      outcome.telegramUnlinked = true;
      await this.provider?.disableUser(account.authUserId);
      account.authUserId = '';
      await this.accounts.save(account);
    }

    const request = this.requests.get(accountId);
    if (request !== undefined) {
      request.completedAt = now;
    }
    return outcome;
  }

  /** 10.4.3 — requests still outstanding, and whether any has passed its seven-day deadline. */
  overdueRequests(now = new Date()): DeletionRequest[] {
    const deadline = DELETION_DEADLINE_DAYS * 86_400_000;
    return [...this.requests.values()].filter(
      (r) => r.completedAt === null && now.getTime() - r.requestedAt.getTime() > deadline,
    );
  }

  requestFor(accountId: Uuid): DeletionRequest | null {
    return this.requests.get(accountId) ?? null;
  }

  /** 10.4.2 — the claim, made checkable. */
  static inventory(): typeof PERSONAL_DATA_INVENTORY {
    return PERSONAL_DATA_INVENTORY;
  }
}
