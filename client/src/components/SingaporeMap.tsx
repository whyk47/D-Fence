/**
 * D-Fence — the drawn map.
 * Stereotype: <<boundary>>. Traces: 9.1.1–9.1.11, 10.4.5, 11.7.2, 11.7.5, 11.7.7, 11.8.13.
 *
 * Until now §9.1 was answered with a list, on the argument that every *fact* the requirement asks
 * the map to convey was present in text. That argument was true and it was not sufficient. A
 * dengue cluster is a shape on the ground, and "Lentor Ave, Cres, Green, Gr, Ln, Plain, Rd, St,
 * Ter, Vale, Walk, Way" is not a place a person can picture. The server has been returning real
 * NEA polygons — fifty-four points for that one cluster — since the feed was first ingested; the
 * client simply never drew them.
 *
 * Four decisions worth defending:
 *
 * **The basemap is OneMap, not a global provider.** Singapore Land Authority tiles, from the same
 * agency whose geocoder already resolves a resident's address. It needs no key, it names local
 * streets and block numbers the way a resident says them, and 10.4.5's attribution obligation is
 * satisfied by a source we already attribute. It is also the only external origin the client
 * touches, which is why the CSP names it explicitly rather than loosening `img-src` to `*`.
 *
 * **The list did not go away.** It is rendered beneath the map, from the same data. Leaflet's
 * panes are not reachable by a screen reader in any useful way, and 11.7.5 does not become
 * optional because a picture is now available. The map is the addition; the text is the record.
 *
 * **Colour is never the only carrier of tier** (9.1.11, 11.7.5). Each polygon is filled by tier
 * *and* labelled by tier in words, in its tooltip, in its popup and in the list.
 *
 * **It degrades rather than explodes.** Leaflet needs a laid-out element, which jsdom does not
 * provide; construction is wrapped so a failure leaves the accessible list standing rather than
 * taking the screen down with it. A map is an enhancement of this screen, not its substance.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
// Statically imported and bundled: the client ships no CDN reference, and esbuild's IIFE output
// has no module loader to resolve a dynamic one at runtime. Leaflet touches no DOM at import
// time, so the cost of importing it on a screen that never draws is a few kilobytes.
import * as L from 'leaflet';
import type { Map as LeafletMap, LayerGroup, PathOptions } from 'leaflet';

/** Roughly the Republic, with enough margin that a cluster on the coast is not against the edge. */
const SINGAPORE_BOUNDS: [[number, number], [number, number]] = [
  [1.15, 103.55],
  [1.51, 104.14],
];
const SINGAPORE_CENTRE: [number, number] = [1.3521, 103.8198];

/**
 * 10.4.5 — the attribution the Singapore Land Authority asks for, rendered by Leaflet in the
 * corner of the map and repeated in the screen's own text so it survives with the drawing off.
 */
export const ONEMAP_ATTRIBUTION =
  '<a href="https://www.onemap.gov.sg/" rel="noreferrer">OneMap</a> © Singapore Land Authority';

/** Two basemaps: the plain one for residents finding their street, grey where colour must carry. */
export type Basemap = 'Default_HD' | 'Grey_HD';

export interface MapCluster {
  clusterId: string;
  locality: string;
  tier: string;
  tierLabel: string;
  caseSize: number;
  /** GeoJSON order — [longitude, latitude] — which is the reverse of how the map wants it. */
  ring: Array<[number, number]>;
}

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  /** The heading of the popup, and the text of the list entry. */
  title: string;
  /** One line under the heading. Never a colour name. */
  detail: string;
  kind: 'report' | 'workOrder' | 'savedLocation';
}

export interface SingaporeMapProps {
  clusters: MapCluster[];
  markers?: MapMarker[];
  basemap?: Basemap;
  /** Called when a cluster shape or its list entry is chosen. Absent means the shapes are inert. */
  onSelectCluster?: (clusterId: string) => void;
  /** Drawn thicker, and the map opens on it. */
  selectedClusterId?: string | null;
  /**
   * How tall the drawn area is. A named size rather than a pixel value, because the CSP forbids
   * inline styles and the answer to that - stated in `ExpressApp`'s own policy comment - is a
   * class in `styles.css`, never a weaker policy.
   */
  size?: 'tall' | 'short';
  /**
   * Points the view should open on — a resident's saved locations, typically. When given, the map
   * opens around them with a kilometre of margin rather than around every cluster in the country:
   * "is it near my block" is answered by a frame that contains my block, and an island-wide view
   * showing sixteen shapes the size of a full stop answers nothing.
   */
  focus?: Array<[number, number]>;
  /** For `data-part` hooks in the acceptance harness. */
  label: string;
}

/**
 * 9.1.11 — the fill for a tier, and the only place a colour is written in this file. Leaflet draws
 * on a canvas element and cannot take a CSS class, so these hex values must exist in JavaScript;
 * they are the same three the stylesheet uses for `--tier-high`, `--tier-medium` and `--tier-low`,
 * and the swatches in the legend take theirs from the stylesheet rather than from here.
 */
const TIER_COLOURS: Record<string, string> = {
  High: '#a4342b',
  Medium: '#b8763a',
  Low: '#4a7c59',
};

const MARKER_COLOURS: Record<MapMarker['kind'], string> = {
  report: '#1b5e56',
  workOrder: '#2f5d8a',
  savedLocation: '#6b3fa0',
};

const MARKER_NAMES: Record<MapMarker['kind'], string> = {
  report: 'Reports',
  workOrder: 'Work orders',
  savedLocation: 'My locations',
};

function tierStyle(tier: string, selected: boolean): PathOptions {
  const colour = TIER_COLOURS[tier] ?? TIER_COLOURS.Low;
  return {
    color: colour,
    weight: selected ? 4 : 2,
    opacity: 1,
    fillColor: colour,
    // Low enough that the street names underneath stay legible, which is the whole reason for
    // putting the shape on a map rather than in a table.
    fillOpacity: selected ? 0.42 : 0.26,
  };
}

/**
 * Escape before interpolating into a Leaflet popup. Popups take an HTML string, and a locality
 * name arrives from a government feed rather than from us — 10.3.x does not stop applying because
 * the source is trusted today.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function SingaporeMap(props: SingaporeMapProps): JSX.Element {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const clusterLayer = useRef<LayerGroup | null>(null);
  const markerLayers = useRef<Partial<Record<MapMarker['kind'], LayerGroup>>>({});
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);
  const legendId = useId();

  const markers = useMemo(() => props.markers ?? [], [props.markers]);
  // 9.1.6 — a layer can be hidden. Only the kinds actually present are offered, so a resident is
  // not shown a switch for work orders they are not permitted to see in the first place.
  const kinds = useMemo(
    () => Array.from(new Set(markers.map((m) => m.kind))) as Array<MapMarker['kind']>,
    [markers],
  );
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  /** Construct the map once, and never let a failure to construct it take the screen down. */
  useEffect(() => {
    let cancelled = false;
    const element = container.current;
    if (element === null || map.current !== null) {
      return;
    }
    /*
     * Leaflet requires a laid-out container: it reads the element's size to decide how many tiles
     * to request and where to put them, and given a zero-width element it constructs an object
     * that throws from inside its own callbacks later, where no `try` of ours can reach it.
     *
     * This is not a test accommodation. A map in a zero-size container is broken in a browser too
     * — inside a `display: none` tab, for instance — and the right response there is the same as
     * here: do not build it, and leave the list standing. jsdom simply makes the case reliable to
     * reproduce.
     */
    if (element.clientWidth === 0 || element.clientHeight === 0) {
      return;
    }
    try {
      {
        const instance = L.map(element, {
          center: SINGAPORE_CENTRE,
          zoom: 11,
          minZoom: 10,
          maxZoom: 18,
          // 11.7.2 — Leaflet's own keyboard handling: arrows pan, +/- zoom, and the container is
          // focusable. Switching this off, as many integrations quietly do, removes the only way
          // to use the map without a mouse.
          keyboard: true,
          // A map that can be dragged into the South China Sea is a map a user has to recover
          // from. `maxBounds` plus viscosity lets it stretch and pull back.
          maxBounds: SINGAPORE_BOUNDS,
          maxBoundsViscosity: 0.7,
          // Two fingers to pan the map, so a phone scrolls the page past it (11.8.x). Without this
          // the map traps the scroll and the screen below becomes unreachable.
          dragging: true,
          scrollWheelZoom: true,
          tap: true,
        });
        L.tileLayer(`https://www.onemap.gov.sg/maps/tiles/${props.basemap ?? 'Default_HD'}/{z}/{x}/{y}.png`, {
          attribution: ONEMAP_ATTRIBUTION,
          maxZoom: 18,
          // OneMap serves Singapore alone; beyond it the tiles are blank, and blank tiles look
          // like a broken map rather than like the edge of the country.
          bounds: SINGAPORE_BOUNDS,
        }).addTo(instance);
        instance.attributionControl.setPrefix('');
        clusterLayer.current = L.layerGroup().addTo(instance);
        for (const kind of ['report', 'workOrder', 'savedLocation'] as const) {
          markerLayers.current[kind] = L.layerGroup().addTo(instance);
        }
        map.current = instance;
        if (!cancelled) {
          setDrawn(true);
        }
      }
    } catch {
      // jsdom, or a browser that could not lay the element out. The list below is the fallback
      // and it is always rendered, so there is nothing to replace.
      if (!cancelled) {
        setFailed(true);
      }
    }
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      clusterLayer.current = null;
      markerLayers.current = {};
    };
    // Constructed once. The basemap is a per-screen constant, not a control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Redraw the cluster shapes whenever the data or the selection changes. */
  useEffect(() => {
    if (!drawn || map.current === null || clusterLayer.current === null) {
      return;
    }
    try {
      const layer = clusterLayer.current;
      const instance = map.current;
      if (layer === null || instance === null) {
        return;
      }
      layer.clearLayers();
      const bounds = L.latLngBounds([]);
      for (const cluster of props.clusters) {
        if (cluster.ring.length < 3) {
          continue;
        }
        const latlngs = cluster.ring.map(([lng, lat]) => [lat, lng] as [number, number]);
        const selected = props.selectedClusterId === cluster.clusterId;
        const shape = L.polygon(latlngs, tierStyle(cluster.tier, selected));
        // Hover and focus both, because a keyboard user gets no hover. Leaflet makes the path
        // focusable when it is interactive, which it is whenever a selection handler exists.
        shape.bindTooltip(`${escapeHtml(cluster.locality)} — ${escapeHtml(cluster.tierLabel)}`, {
          sticky: true,
        });
        shape.bindPopup(
          `<strong>${escapeHtml(cluster.locality)}</strong><br>${escapeHtml(cluster.tierLabel)}<br>${cluster.caseSize} case(s)`,
        );
        if (props.onSelectCluster !== undefined) {
          shape.on('click', () => props.onSelectCluster?.(cluster.clusterId));
          shape.on('keypress', (event) => {
            const key = (event as unknown as { originalEvent?: KeyboardEvent }).originalEvent?.key;
            if (key === 'Enter' || key === ' ') {
              props.onSelectCluster?.(cluster.clusterId);
            }
          });
        }
        shape.addTo(layer);
        bounds.extend(shape.getBounds());
      }
      const focus = props.focus ?? [];
      if (focus.length > 0) {
        const near = L.latLngBounds(focus.map(([lat, lng]) => L.latLng(lat, lng)));
        // One saved location is a point, and a point has no extent — `fitBounds` on it would zoom
        // to the maximum and show a rooftop. Roughly 700 m of margin in each direction gives a
        // frame with streets and the nearest cluster boundary in it.
        const margin = 0.0065;
        instance.fitBounds(
          L.latLngBounds(
            [near.getSouth() - margin, near.getWest() - margin],
            [near.getNorth() + margin, near.getEast() + margin],
          ),
          { padding: [16, 16], maxZoom: 16 },
        );
      } else if (bounds.isValid()) {
        // Open on the data rather than on the middle of the island: sixteen clusters in the north
        // and an empty south would otherwise put every shape in the top third of the frame.
        instance.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
      }
    } catch {
      // A redraw that fails must not take the screen with it; the list below is unaffected.
      setFailed(true);
    }
  }, [drawn, props.clusters, props.focus, props.selectedClusterId, props.onSelectCluster]);

  /** Redraw the markers. Separate from the shapes so toggling a layer does not refit the view. */
  useEffect(() => {
    if (!drawn || map.current === null) {
      return;
    }
    try {
      for (const kind of ['report', 'workOrder', 'savedLocation'] as const) {
        const layer = markerLayers.current[kind];
        if (layer === undefined) {
          continue;
        }
        layer.clearLayers();
        if (hidden[kind] === true) {
          continue;
        }
        for (const marker of markers.filter((m) => m.kind === kind)) {
          L.circleMarker([marker.latitude, marker.longitude], {
            radius: 6,
            color: '#ffffff',
            weight: 2,
            fillColor: MARKER_COLOURS[kind],
            fillOpacity: 1,
          })
            .bindPopup(`<strong>${escapeHtml(marker.title)}</strong><br>${escapeHtml(marker.detail)}`)
            .addTo(layer);
        }
      }
    } catch {
      setFailed(true);
    }
  }, [drawn, markers, hidden]);

  /** 9.1.7 — recentre on everything, for a user who has panned away and wants back. */
  function resetView(): void {
    const instance = map.current;
    if (instance === null) {
      return;
    }
    const bounds = L.latLngBounds([]);
    for (const cluster of props.clusters) {
      for (const [lng, lat] of cluster.ring) {
        bounds.extend([lat, lng]);
      }
    }
    if (bounds.isValid()) {
      instance.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
    } else {
      instance.setView(SINGAPORE_CENTRE, 11);
    }
  }

  const tiersPresent = Array.from(new Set(props.clusters.map((c) => c.tier)));

  return (
    <div className="map" data-part={props.label}>
      <div className="map-toolbar">
        {/* 9.1.6 — the layer switches, and only for layers this caller actually received. */}
        {kinds.map((kind) => (
          <label key={kind} className="map-toggle">
            <input
              type="checkbox"
              checked={hidden[kind] !== true}
              onChange={(event) =>
                setHidden((previous) => ({ ...previous, [kind]: !event.target.checked }))
              }
            />
            <span className="map-swatch" data-kind={kind} aria-hidden="true" />
            {MARKER_NAMES[kind]}
          </label>
        ))}
        <button type="button" onClick={resetView} disabled={!drawn}>
          Fit to clusters
        </button>
      </div>

      {/*
        * `role="application"` rather than `img`: the arrow keys pan and +/- zoom, and telling a
        * screen reader it is an image would take those away. The description points at the list,
        * which is where the same information is readable.
        */}
      <div
        ref={container}
        className="map-canvas"
        data-size={props.size ?? 'tall'}
        role="application"
        aria-label={`Map of active dengue clusters. ${props.clusters.length} cluster(s). Arrow keys pan, plus and minus zoom.`}
        aria-describedby={legendId}
      />

      <p id={legendId} className="map-legend">
        {/* 9.1.11, 11.7.5 — the key, in words. A colour-blind reader and a printout both get this. */}
        {tiersPresent.length === 0 ? 'No cluster boundaries to draw.' : null}
        {tiersPresent.map((tier) => (
          <span key={tier} className="map-key" data-tier={tier}>
            <span className="map-swatch" data-tier={tier} aria-hidden="true" />
            {tier} priority
          </span>
        ))}
        <span className="map-attribution">Map data: OneMap © Singapore Land Authority</span>
      </p>

      {failed ? (
        // 10.5.3 — a cause and a remedy, and never a blank rectangle.
        <p role="status" data-part="map-unavailable">
          The map could not be drawn on this device. Every cluster is listed below.
        </p>
      ) : null}
    </div>
  );
}
