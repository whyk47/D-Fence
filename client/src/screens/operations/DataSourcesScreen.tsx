/**
 * D-Fence — DataSources screen (REQUIREMENTS.md 11.2.23).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function DataSourcesScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="DataSources" data-requirement="11.2.23">{state.kind}</main>;
}
