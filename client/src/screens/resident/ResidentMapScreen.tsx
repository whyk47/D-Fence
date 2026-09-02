/**
 * D-Fence — ResidentMap screen (REQUIREMENTS.md 11.2.5).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function ResidentMapScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="ResidentMap" data-requirement="11.2.5">{state.kind}</main>;
}
