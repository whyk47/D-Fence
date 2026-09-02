/**
 * D-Fence — PasswordReset screen (REQUIREMENTS.md 11.2.4).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function PasswordResetScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="PasswordReset" data-requirement="11.2.4">{state.kind}</main>;
}
