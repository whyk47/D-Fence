/**
 * D-Fence — WorkOrderList screen (REQUIREMENTS.md 11.2.25).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function WorkOrderListScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="WorkOrderList" data-requirement="11.2.25">{state.kind}</main>;
}
