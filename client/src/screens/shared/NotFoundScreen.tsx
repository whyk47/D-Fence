/**
 * D-Fence — NotFound screen (REQUIREMENTS.md 11.2.24).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function NotFoundScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="NotFound" data-requirement="11.2.24">{state.kind}</main>;
}
