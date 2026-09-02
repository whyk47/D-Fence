/**
 * D-Fence — ReportSite screen (REQUIREMENTS.md 11.2.8).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 */
import { LoadState } from '../../lib/LoadState';

export function ReportSiteScreen(): JSX.Element {
  // TODO: fetch through ApiClient; render one branch per LoadState (11.4).
  const state: LoadState = { kind: 'loading' };
  return <main data-screen="ReportSite" data-requirement="11.2.8">{state.kind}</main>;
}
