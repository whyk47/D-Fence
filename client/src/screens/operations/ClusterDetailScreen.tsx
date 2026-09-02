/**
 * D-Fence — ClusterDetail screen (REQUIREMENTS.md 11.2.13).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function ClusterDetailScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="ClusterDetail" data-requirement="11.2.13">{state.kind}</main>;
}
