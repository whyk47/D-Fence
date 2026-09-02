/**
 * D-Fence — Supabase Auth adapter.
 * Stereotype: <<boundary>>. Traces: 2.1.1–2.1.12, 10.3.1, 10.3.4.
 *
 * Chosen 2026-09-03 over hand-rolled credentials — see lab3/DESIGN-MODEL.md §3.3 for the reasoning
 * and the cost either way. The service key is read from the environment and never from the
 * repository (10.3.4).
 *
 * Note on 10.3.1 and 2.1.7. Both require a stored, salted password hash, and both are still
 * satisfied: Supabase Auth stores it in the `auth` schema of the same PostgreSQL database this
 * system uses. What changed is which schema owns it and who writes the hashing code, not whether
 * the hash exists. Nothing outside this file can read it.
 */
import {
  AuthCredentials,
  AuthProvider,
  AuthSession,
  AuthUserId,
} from '../../ports/AuthProvider';

export class SupabaseAuthGateway implements AuthProvider {
  /**
   * @param url project URL
   * @param serviceKey service-role key — server-side only. It bypasses row-level security, so it
   *   must never reach the browser bundle; the client uses the anon key instead.
   */
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
  ) {}

  register(_credentials: AuthCredentials): Promise<AuthUserId> {
    // TODO(F2): auth.signUp. 2.1.2 and 2.1.3 (length, letter-and-digit) are checked by
    // AuthenticationController before this call, because they are our rules, not the provider's.
    throw new Error('not implemented');
  }

  signIn(_credentials: AuthCredentials): Promise<AuthSession> {
    // TODO(F2): auth.signInWithPassword. Throws AuthenticationFailed on refusal; the caller counts
    // the failure towards the 2.1.10 lock-out, which this provider does not express.
    throw new Error('not implemented');
  }

  signOut(_token: string): Promise<void> {
    throw new Error('not implemented');
  }

  requestPasswordReset(_email: string): Promise<void> {
    // TODO(F2): resetPasswordForEmail. 2.1.11 wants 30 minutes and single use — set the expiry in
    // project configuration and record the value in ConfigSet so it is checkable, not assumed.
    throw new Error('not implemented');
  }

  completePasswordReset(_token: string, _newPassword: string): Promise<void> {
    throw new Error('not implemented');
  }

  verifyToken(_token: string): Promise<AuthUserId | null> {
    throw new Error('not implemented');
  }

  createUser(_credentials: AuthCredentials): Promise<AuthUserId> {
    // TODO(F2): admin.createUser, for 2.2.3 staff accounts created by a manager.
    throw new Error('not implemented');
  }

  disableUser(_authUserId: AuthUserId): Promise<void> {
    throw new Error('not implemented');
  }

  deleteUser(_authUserId: AuthUserId): Promise<void> {
    throw new Error('not implemented');
  }
}
