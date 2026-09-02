/**
 * D-Fence — StaffAccounts screen (REQUIREMENTS.md 11.2.22).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function StaffAccountsScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="StaffAccounts" data-requirement="11.2.22">{state.kind}</main>;
}
