/**
 * D-Fence — JobDetail screen (REQUIREMENTS.md 11.2.20).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function JobDetailScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="JobDetail" data-requirement="11.2.20">{state.kind}</main>;
}
