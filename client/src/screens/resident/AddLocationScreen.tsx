/**
 * D-Fence — AddLocation screen (REQUIREMENTS.md 11.2.7).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function AddLocationScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="AddLocation" data-requirement="11.2.7">{state.kind}</main>;
}
