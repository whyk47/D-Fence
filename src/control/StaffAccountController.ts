/**
 * D-Fence — provisioning and deactivating staff accounts.
 * Stereotype: <<control>>. Realises use case 1.4. Traces: 2.2.3, 2.2.4, 2.2.5, 2.4.1, 8.2.3.
 *
 * Deactivation, never deletion. 2.4.1 requires the acting user and target of every state change to
 * be recorded, and an audit record pointing at a deleted account is an audit record that cannot be
 * read. The account row survives; `isActive` is what changes.
 */
import { Role } from '../entity/enums';
import { Uuid } from '../entity/valueTypes';
import { Account } from '../entity/Account';
import { AuthProvider } from '../ports/AuthProvider';
import { AccountStore, AuditStore, SessionStore } from '../ports/Stores';
import { AccessControlService } from './AccessControlService';
import { AuthenticationController, AuthenticationRefused } from './AuthenticationController';
import { Principal } from './Principal';

export class StaffAccountController {
  constructor(
    private readonly ac: AccessControlService,
    private readonly auth: AuthProvider,
    private readonly accounts: AccountStore,
    private readonly sessions: SessionStore,
    private readonly audit: AuditStore | null = null,
  ) {}

  /**
   * 2.2.3. Manager only. Creates the provider identity and the Account row together.
   *
   * A staff account is created **already verified**: 2.1.5's link exists so that a stranger proves
   * they own the address, and here a manager has vouched for them. Leaving it unverified would
   * mean a crew member cannot sign in until they follow an email nobody sent them.
   *
   * @throws AuthenticationRefused when the role is not one a manager may provision
   */
  async createStaffAccount(email: string, role: Role, password: string, by: Principal, now = new Date()): Promise<Account> {
    await this.ac.authorise(by, 'staff:manage', { kind: 'account' });
    if (role === Role.Resident) {
      // 2.2.3 names the Operations Manager and Cleaning Crew roles. A Resident account is what
      // self-registration is for (2.2.2), and routing it through here would skip 2.1.5 entirely.
      throw new AuthenticationRefused('a Resident account is created by self-registration (2.2.2)');
    }
    const address = AuthenticationController.normaliseEmail(email);
    if ((await this.accounts.findByEmail(address)) !== null) {
      throw new AuthenticationRefused('that email address is already registered');
    }
    const problem = AuthenticationController.passwordProblem(password);
    if (problem !== null) {
      throw new AuthenticationRefused(problem); // 2.1.2, 2.1.3 apply to staff as well
    }

    const account = new Account();
    account.email = address;
    account.authUserId = await this.auth.createUser({ email: address, password });
    account.emailVerified = true;
    account.role = role;
    account.isActive = true;
    account.telegramChatId = null;
    account.createdAt = now;
    const saved = await this.accounts.save(account);
    await this.audit?.appendAction(by.accountId, `account:create:${role}`, 'Account', saved.id); // 2.4.1
    return saved;
  }

  /**
   * 2.2.4, 2.2.5. Deactivation ends the account's live sessions in the same call.
   *
   * Without that, 2.2.5 would only bite at the next sign-in, and a crew member deactivated at noon
   * would keep working from an open browser tab until their session expired the following day.
   *
   * @returns the number of sessions terminated, which the confirmation screen states
   */
  async deactivateAccount(id: Uuid, by: Principal, now = new Date()): Promise<{ account: Account; sessionsEnded: number }> {
    await this.ac.authorise(by, 'staff:manage', { kind: 'account', id });
    const account = await this.accounts.findById(id);
    if (account === null) {
      throw new AuthenticationRefused('no such account');
    }
    if (account.id === by.accountId) {
      // Not in the requirements, and added deliberately: 2.2.3 makes the Operations Manager the
      // only role that can create one, so a manager deactivating themselves can leave a deployment
      // with no way back in.
      throw new AuthenticationRefused('you cannot deactivate your own account');
    }
    account.isActive = false;
    await this.accounts.save(account);
    await this.auth.disableUser(account.authUserId);
    const sessionsEnded = await this.sessions.terminateAllFor(account.id, now);
    await this.audit?.appendAction(by.accountId, 'account:deactivate', 'Account', account.id); // 2.4.1
    return { account, sessionsEnded };
  }

  /** 2.2.4 — reinstatement. The mirror of deactivation, and audited the same way. */
  async reactivateAccount(id: Uuid, by: Principal): Promise<Account> {
    await this.ac.authorise(by, 'staff:manage', { kind: 'account', id });
    const account = await this.accounts.findById(id);
    if (account === null) {
      throw new AuthenticationRefused('no such account');
    }
    account.isActive = true;
    account.clearFailedAttempts(); // a reinstated account does not inherit its old lock-out
    // The provider identity was disabled on the way out and has to be re-enabled on the way back
    // in, or the account row says active and every sign-in still fails. Found by test T6.
    await this.auth.enableUser(account.authUserId);
    const saved = await this.accounts.save(account);
    await this.audit?.appendAction(by.accountId, 'account:reactivate', 'Account', saved.id);
    return saved;
  }

  /**
   * 8.2.2, 8.2.3 — the crew a manager may assign work to. Active accounts only, so a deactivated
   * member cannot be picked in the first place rather than being refused at the point of assignment.
   */
  async assignableCrew(by: Principal): Promise<Account[]> {
    await this.ac.authorise(by, 'staff:manage', { kind: 'account' });
    return (await this.accounts.findByRole(Role.CleaningCrew)).filter((a) => a.isActive);
  }

  /** The staff list a manager administers: both operational roles, active and not. */
  async listStaff(by: Principal): Promise<Account[]> {
    await this.ac.authorise(by, 'staff:manage', { kind: 'account' });
    const managers = await this.accounts.findByRole(Role.OperationsManager);
    const crew = await this.accounts.findByRole(Role.CleaningCrew);
    return [...managers, ...crew].sort((a, b) => a.email.localeCompare(b.email));
  }
}
