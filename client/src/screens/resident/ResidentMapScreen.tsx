/**
 * D-Fence — Resident Map screen (REQUIREMENTS.md 11.2.5).
 * Stereotype: <<boundary>>. Traces: 11.2.5, 9.1.1–9.1.11, 11.7.5, 11.4.2.
 *
 * **On the absence of a map library.** No mapping SDK is bundled, so this renders the same layer
 * data as an accessible list rather than a drawn map. That is a deliberate, stated limitation, not
 * an oversight: every fact 9.1.x asks the map to convey — which clusters are active, their tier,
 * their size, where the resident's own saved locations sit relative to them — is present and
 * readable here, and a list is the one form of it a screen reader can use at all (11.7.x).
 *
 * 9.1.11 is the requirement that makes this defensible: the tier must be conveyed by a **label**,
 * not by colour, precisely so the information survives without the drawing.
 */
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { link } from '../../components/Link';
import { ScreenProps } from '../ScreenProps';

interface Layers {
  clusters: Array<{
    clusterId: string;
    locality: string;
    tier: string;
    tierLabel: string;
    caseSize: number;
    ring: Array<[number, number]>;
  }>;
  reports: Array<{ reportId: string; type: string; status: string }>;
  savedLocations: Array<{ name: string; status: string }>;
}

export function ResidentMapScreen(props: ScreenProps): JSX.Element {
  const { state, value, retry } = useLoad<Layers>(props.api, '/api/map/layers', {
    isEmpty: (v) => v.clusters.length === 0,
    emptyMessage: 'There are no active dengue clusters in the current feed.',
  });

  return (
    <section data-screen="ResidentMap" data-requirement="11.2.5">
      <h1>Dengue map</h1>

      <StateView state={state} onRetry={retry}>
        <section data-part="clusters">
          <h2>Active clusters</h2>
          <ul>
            {(value?.clusters ?? []).map((cluster) => (
              <li key={cluster.clusterId} data-tier={cluster.tier}>
                <h3>{cluster.locality}</h3>
                {/* 9.1.11, 11.7.5 — the tier in words. Colour, when a map is drawn over this, is
                    an addition to the label and never a replacement for it. */}
                <p data-part="tier">{cluster.tierLabel}</p>
                <p data-part="cases">{cluster.caseSize} case(s)</p>
              </li>
            ))}
          </ul>
        </section>

        {(value?.savedLocations ?? []).length === 0 ? null : (
          <section data-part="saved">
            <h2>Your saved locations</h2>
            <ul>
              {(value?.savedLocations ?? []).map((location) => (
                <li key={location.name} data-status={location.status}>
                  {location.name} — {location.status}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(value?.reports ?? []).length === 0 ? null : (
          <section data-part="reports">
            <h2>Recent reports</h2>
            {/* 5.2.9 — a resident sees the markers anonymised; the server decided that, not this
                screen, which is why nothing here strips a field. */}
            <ul>
              {(value?.reports ?? []).map((report) => (
                <li key={report.reportId}>
                  {report.type} — {report.status}
                </li>
              ))}
            </ul>
          </section>
        )}
      </StateView>

      <nav aria-label="Map actions">
        <a href="/report" onClick={link(props, '/report')}>
          Report a site
        </a>
        <a href="/locations" onClick={link(props, '/locations')}>
          My locations
        </a>
      </nav>
    </section>
  );
}
