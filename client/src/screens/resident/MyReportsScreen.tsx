/**
 * D-Fence — MyReports screen (REQUIREMENTS.md 11.2.9).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function MyReportsScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="MyReports" data-requirement="11.2.9">{state.kind}</main>;
}
