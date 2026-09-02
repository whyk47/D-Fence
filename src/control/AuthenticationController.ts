/**
 * D-Fence — AuthenticationController.
 * Stereotype: <<control>>. Realises use cases 1.1-1.3, 1.5; 2.1.x, 10.3.1
 *
 * Delegates credentials to the AuthProvider port (Supabase Auth, decided 2026-09-03). Two rules
 * stay here because the provider does not express them: the 2.1.2 and 2.1.3 password rules, which
 * are checked before the provider is called so the message can name the rule that failed (10.5.3);
 * and the 2.1.10 lock-out, which is specified precisely enough that no provider setting matches it.
 * The role (2.2.1) is also ours, because the whole of §2.3 is written in terms of it.
 */
import { Role, ReportType, DeliveryOutcome } from '../entity/enums';
import { Uuid, GeoPoint } from '../entity/valueTypes';
import { Principal } from './Principal';
import { AuthProvider } from '../ports/AuthProvider';

// TODO: narrow these to the entities this controller actually touches once the bodies exist.
type Account = unknown; type SavedLocation = unknown; type SavedLocationDraft = unknown;
type Report = unknown; type ReportDraft = unknown; type Alert = unknown;
type Cluster = unknown; type PriorityScore = unknown; type SourceHealth = unknown;
type DashboardOverview = unknown; type AttentionItem = unknown;

export class AuthenticationController {
  // TODO: AccountRepository and SessionRepository are injected by AppConfigurator.
  constructor(private readonly auth: AuthProvider) {}

  /** 2.1.1-2.1.5. Checks 2.1.2 and 2.1.3 here, then delegates; the provider stores the hash. */
  register(email: string, password: string): Promise<Account> {
    throw new Error('not implemented');
  }

  /** 2.1.6-2.1.8 via the provider; counts the failure and applies the 2.1.10 lock-out here. */
  signIn(email: string, password: string): Promise<Principal> {
    throw new Error('not implemented');
  }

  /** Use case 1.5 — added after the Lab 1 critique found 2.1.12 unrepresented. */
  signOut(sessionId: Uuid): Promise<void> {
    throw new Error('not implemented');
  }

  /** Same response whether or not the address exists. */
  requestReset(email: string): Promise<void> {
    throw new Error('not implemented');
  }

  /** On success the user continues to Sign In — see the dialog map, ResetForm -> SignIn. */
  completeReset(token: string, password: string): Promise<void> {
    throw new Error('not implemented');
  }

}
