/**
 * D-Fence — SignIn screen (REQUIREMENTS.md 11.2.3).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function SignInScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="SignIn" data-requirement="11.2.3">{state.kind}</main>;
}
