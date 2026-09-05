/**
 * D-Fence — Resident Map screen (REQUIREMENTS.md 11.2.5).
 * Stereotype: <<boundary>>. Traces: 11.2.5, 9.1.1–9.1.11, 11.7.5, 11.4.2.
 *
 * **The map is drawn, and the list stayed.** This screen used to be a list alone, on the argument
 * that every fact 9.1.x asks for was present in text. It was — and a resident asking "is the
 * cluster near my block" cannot answer it from "Lentor Ave, Cres, Green, Gr, Ln, Plain, Rd, St,
 * Ter, Vale, Walk, Way". `SingaporeMap` draws the real NEA polygons over OneMap tiles; the list
 * below is unchanged and is still the form a screen reader can use (11.7.x).
 *
 * 9.1.11 is the requirement that governs both halves: the tier is conveyed by a **label**, not by
 * colour, so the information survives with the drawing off, on a printout, and for a reader who
 * cannot distinguish the fills.
 */
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { link } from '../../components/Link';
import { SingaporeMap, MapCluster, MapMarker } from '../../components/SingaporeMap';
import { ScreenProps } from '../ScreenProps';

interface Layers {
  clusters: MapCluster[];
  reports: Array<{ reportId: string; type: string; status: string; latitude: number; longitude: number }>;
  savedLocations: Array<{
    savedLocationId: string;
    label: string;
    exposureStatus: string;
    latitude: number;
    longitude: number;
  }>;
}

export function ResidentMapScreen(props: ScreenProps): JSX.Element {
  const { state, value, retry } = useLoad<Layers>(props.api, '/api/map/layers', {
    isEmpty: (v) => v.clusters.length === 0,
    emptyMessage: 'There are no active dengue clusters in the current feed.',
  });

  // 9.1.3, 9.1.5 — the resident's own saved locations and the reports the server judged safe to
  // show them. Nothing is filtered here: what arrived is what they are permitted to see.
  const markers: MapMarker[] = [
    ...(value?.savedLocations ?? []).map((location) => ({
      id: location.savedLocationId,
      latitude: location.latitude,
      longitude: location.longitude,
      title: location.label,
      detail: `Your location — ${location.exposureStatus}`,
      kind: 'savedLocation' as const,
    })),
    ...(value?.reports ?? []).map((report) => ({
      id: report.reportId,
      latitude: report.latitude,
      longitude: report.longitude,
      title: report.type,
      detail: `Report — ${report.status}`,
      kind: 'report' as const,
    })),
  ];

  return (
    <section data-screen="ResidentMap" data-requirement="11.2.5">
      <h1>Dengue map</h1>

      <StateView state={state} onRetry={retry}>
        <SingaporeMap
          label="resident-map"
          clusters={value?.clusters ?? []}
          markers={markers}
          size="short"
          // 9.1.5 — open on the resident's own places when they have any. A resident opening this
          // screen is asking about their block, not about the country.
          focus={(value?.savedLocations ?? []).map((l) => [l.latitude, l.longitude] as [number, number])}
        />

        <section data-part="clusters">
          <h2>Active clusters</h2>
          {/* `data-part="list"` is the card treatment the stylesheet already defines for exactly
              this shape — a list where each entry is a thing rather than a line. */}
          <ul data-part="list">
            {(value?.clusters ?? []).map((cluster) => (
              <li key={cluster.clusterId} data-tier={cluster.tier}>
                <h3>{cluster.locality}</h3>
                {/* 9.1.11, 11.7.5 — the tier in words. Colour, on the map above and in the pill
                    around this text, is an addition to the label and never a replacement. */}
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
                <li key={location.savedLocationId} data-status={location.exposureStatus}>
                  {location.label} — {location.exposureStatus}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(value?.reports ?? []).length === 0 ? null : (
          <section data-part="reports">
            {/*
              * Capped at ten. Forty-nine identical "Standing water — Verified" lines is not more
              * information than ten of them; it is the same information, made unreadable, on the
              * screen most likely to be held in one hand. The count is stated so the cap is a
              * stated fact rather than a silent omission.
              */}
            <h2>Recent reports</h2>
            <p data-part="report-count">
              {(value?.reports ?? []).length <= 10
                ? `${(value?.reports ?? []).length} report(s) near you.`
                : `Showing 10 of ${(value?.reports ?? []).length} reports. All of them are on the map above.`}
            </p>
            {/* 5.2.9 — a resident sees the markers anonymised; the server decided that, not this
                screen, which is why nothing here strips a field. */}
            <ul>
              {(value?.reports ?? []).slice(0, 10).map((report) => (
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
