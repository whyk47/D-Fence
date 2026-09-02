/**
 * D-Fence — AlertSettings screen (REQUIREMENTS.md 11.2.11).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function AlertSettingsScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="AlertSettings" data-requirement="11.2.11">{state.kind}</main>;
}
