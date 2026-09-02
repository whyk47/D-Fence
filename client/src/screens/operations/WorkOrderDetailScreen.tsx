/**
 * D-Fence — WorkOrderDetail screen (REQUIREMENTS.md 11.2.18).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function WorkOrderDetailScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="WorkOrderDetail" data-requirement="11.2.18">{state.kind}</main>;
}
