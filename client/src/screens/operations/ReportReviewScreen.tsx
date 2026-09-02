/**
 * D-Fence — ReportReview screen (REQUIREMENTS.md 11.2.15).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function ReportReviewScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="ReportReview" data-requirement="11.2.15">{state.kind}</main>;
}
