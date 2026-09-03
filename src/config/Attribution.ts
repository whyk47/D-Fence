/**
 * D-Fence — the attribution every government data source requires.
 * Traces: 10.4.4, 10.4.5, 10.2.2.
 *
 * 10.4.4 is a licence obligation, not a courtesy: the Singapore Open Data Licence requires the
 * source to be named wherever its data is shown. It was traced by US-0.4 and implemented nowhere,
 * which is the sort of omission that is invisible until somebody from the agency looks at the demo.
 *
 * **The registry lives in code rather than in a footer component** for two reasons. A string in a
 * React footer is one nobody updates when a fifth source is added, and 10.4.5 — "only public
 * sources requiring no third-party authentication" — is a claim about the *system*, so it needs a
 * place where it can be stated per source and checked by a test rather than asserted in a report.
 *
 * Each entry names the screens it must appear on, so the obligation travels with the source instead
 * of relying on whoever builds a screen remembering which feeds it draws from.
 */
import { SourceKind } from '../entity/enums';

export interface SourceAttribution {
  source: SourceKind;
  /** The line shown to a user. The agency's own name for itself, not ours for it. */
  text: string;
  /** Where the data comes from, for a reader who wants to check it. */
  url: string;
  licence: string;
  /**
   * 10.4.5 — whether reaching this source needs a credential issued by a third party.
   *
   * OneMap is the honest exception and is recorded as one rather than hidden: it is a Singapore
   * government service, its data is open, but its API requires a registered account and a token
   * that expires. Calling that "no third-party authentication" because the publisher is a
   * government agency would be reading the requirement to suit us.
   */
  requiresCredential: boolean;
  /** 11.2.x screen ids on which this attribution must appear. */
  shownOn: readonly string[];
}

/** Every external source, and what each obliges. */
export const ATTRIBUTIONS: readonly SourceAttribution[] = [
  {
    source: SourceKind.Clusters,
    text: 'Dengue cluster data © National Environment Agency, from data.gov.sg',
    url: 'https://data.gov.sg/datasets/d_dbfabf16158d1b0e1c420627c0819168/view',
    licence: 'Singapore Open Data Licence v1.0',
    requiresCredential: false,
    shownOn: ['MapView', 'OpsDashboard', 'ClusterDetail', 'PriorityTable', 'DataSources'],
  },
  {
    source: SourceKind.Rainfall,
    text: 'Rainfall readings © Meteorological Service Singapore, from data.gov.sg',
    url: 'https://data.gov.sg/datasets?query=rainfall',
    licence: 'Singapore Open Data Licence v1.0',
    requiresCredential: false,
    shownOn: ['OpsDashboard', 'ClusterDetail', 'PriorityTable', 'LocationDetail', 'DataSources'],
  },
  {
    source: SourceKind.Forecast,
    text: '24-hour weather forecast © Meteorological Service Singapore, from data.gov.sg',
    url: 'https://data.gov.sg/datasets?query=24-hour+weather+forecast',
    licence: 'Singapore Open Data Licence v1.0',
    requiresCredential: false,
    shownOn: ['MapView', 'ClusterDetail', 'LocationDetail', 'DataSources'],
  },
  {
    source: SourceKind.Geocoding,
    text: 'Address search © OneMap, Singapore Land Authority',
    url: 'https://www.onemap.gov.sg/',
    licence: 'OneMap API Terms of Service',
    // The exception, recorded rather than argued away. See the field's own note.
    requiresCredential: true,
    shownOn: ['AddLocation', 'ConfirmAddress', 'DataSources'],
  },
] as const;

export class Attribution {
  /** 10.4.4 — every attribution a given screen must display. */
  static forScreen(screenId: string): SourceAttribution[] {
    return ATTRIBUTIONS.filter((a) => a.shownOn.includes(screenId));
  }

  static forSource(source: SourceKind): SourceAttribution | null {
    return ATTRIBUTIONS.find((a) => a.source === source) ?? null;
  }

  /**
   * 10.4.5 — the sources that need a third-party credential.
   *
   * Returned rather than asserted to be empty. The requirement as written is not satisfied by this
   * system, and a method that pretended otherwise would be worse than the gap: this way the
   * exception is enumerable, testable, and shows up in the demo notes instead of being discovered
   * during marking.
   */
  static credentialedSources(): SourceAttribution[] {
    return ATTRIBUTIONS.filter((a) => a.requiresCredential);
  }

  /** The footer line for a screen: one sentence per source, in a stable order. */
  static footerFor(screenId: string): string {
    return Attribution.forScreen(screenId)
      .map((a) => a.text)
      .join(' · ');
  }
}
