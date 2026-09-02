/**
 * D-Fence — JobCompletion screen (REQUIREMENTS.md 11.2.21).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function JobCompletionScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="JobCompletion" data-requirement="11.2.21">{state.kind}</main>;
}
