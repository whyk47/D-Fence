/**
 * D-Fence — OperationsDashboard screen (REQUIREMENTS.md 11.2.12).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function OperationsDashboardScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="OperationsDashboard" data-requirement="11.2.12">{state.kind}</main>;
}
