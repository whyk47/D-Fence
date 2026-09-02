/**
 * D-Fence — WorkOrderCreate screen (REQUIREMENTS.md 11.2.17).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function WorkOrderCreateScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="WorkOrderCreate" data-requirement="11.2.17">{state.kind}</main>;
}
