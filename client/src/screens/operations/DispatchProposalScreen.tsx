/**
 * D-Fence — DispatchProposal screen (REQUIREMENTS.md 11.2.16).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function DispatchProposalScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="DispatchProposal" data-requirement="11.2.16">{state.kind}</main>;
}
