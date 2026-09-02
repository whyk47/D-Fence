/**
 * D-Fence — Landing screen (REQUIREMENTS.md 11.2.1).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function LandingScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="Landing" data-requirement="11.2.1">{state.kind}</main>;
}
