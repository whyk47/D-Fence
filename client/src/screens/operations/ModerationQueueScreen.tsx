/**
 * D-Fence — ModerationQueue screen (REQUIREMENTS.md 11.2.14).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function ModerationQueueScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="ModerationQueue" data-requirement="11.2.14">{state.kind}</main>;
}
