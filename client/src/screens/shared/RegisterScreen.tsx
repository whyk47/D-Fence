/**
 * D-Fence — Register screen (REQUIREMENTS.md 11.2.2).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function RegisterScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="Register" data-requirement="11.2.2">{state.kind}</main>;
}
