/**
 * D-Fence — MyJobs screen (REQUIREMENTS.md 11.2.19).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function MyJobsScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="MyJobs" data-requirement="11.2.19">{state.kind}</main>;
}
