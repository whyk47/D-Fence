/**
 * D-Fence — ReportDetail screen (REQUIREMENTS.md 11.2.10).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function ReportDetailScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="ReportDetail" data-requirement="11.2.10">{state.kind}</main>;
}
