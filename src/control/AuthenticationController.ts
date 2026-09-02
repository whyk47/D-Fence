/**
 * D-Fence — AuthenticationController.
 * Stereotype: <<control>>. Realises use cases 1.1-1.3, 1.5; 2.1.x, 10.3.1
 */
import { Role, ReportType, DeliveryOutcome } from '../entity/enums';
import { Uuid, GeoPoint } from '../entity/valueTypes';
import { Principal } from './Principal';

// TODO: narrow these to the entities this controller actually touches once the bodies exist.
type Account = unknown; type SavedLocation = unknown; type SavedLocationDraft = unknown;
type Report = unknown; type ReportDraft = unknown; type Alert = unknown;
type Cluster = unknown; type PriorityScore = unknown; type SourceHealth = unknown;
type DashboardOverview = unknown; type AttentionItem = unknown;

export class AuthenticationController {
  // TODO: repositories and collaborators are injected by AppConfigurator.

  /** 2.1.x. Password stored only as a salted hash (10.3.1). */
  register(email: string, password: string): Promise<Account> {
    throw new Error('not implemented');
  }

  /** Locks after repeated failures. */
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
