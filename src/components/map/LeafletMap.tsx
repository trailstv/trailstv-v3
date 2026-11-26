"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Polyline, LayersControl, LayerGroup, ScaleControl, useMap } from "react-leaflet";
import { markerIcon } from "./icons";
import { DIFFICULTY_COLORS, type MarkerKind } from "./pins";
import { googleDirections } from "@/lib/directions";
import { useExplorer } from "@/components/explorer/Explorer";
import { useOsmTrails } from "@/components/explorer/OsmTrails";
import { OsmTrailsLayer } from "./OsmTrailsLayer";
import type { TrailUse } from "@/lib/osm-trails";
import { pinsForActivity, TOP_PINS } from "./park-pins";

export interface MapMarker {
  /** Links the pin to a right-hand list item (see Explorer). */
  id?: string;
  /** Group ids this pin belongs to (e.g. activity slugs), so a list item can highlight many pins. */
  groups?: string[];
  /** Allowed trail uses; with a Trail use filter active, pins that don't match are hidden. */
  uses?: string[];
  /** Trailhead pins: activities + trail type, so the park page's activity buttons can filter them */
  activities?: string[];
  trailType?: "terra" | "snow" | "water";
  lat: number;
  lon: number;
  kind: MarkerKind;
  label: string;
  href?: string;
  detail?: string;
  /** Optional second line in the info popup (e.g. a park's tagline). */
  blurb?: string;
  /** Optional photo shown at the top of the info popup. */
  image?: string;
  difficulty?: string;
}

export interface LeafletMapProps {
  center: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  /** Trail geometry as [lon, lat][] (GeoJSON order, as stored in flat files) */
  line?: [number, number][];
  /** Several route lines ([lon, lat][] each), e.g. an imported trail made of segments */
  lines?: [number, number][][];
  lineDifficulty?: string;
  /** When set, live overlays (campgrounds, river gauges, boat launches) are loaded for this park. */
  parkCode?: string;
  height?: number | string;
  /** Zoom the map to fit all markers (and the trail line). */
  fitMarkers?: boolean;
  /** Explicit view bounds [[south, west], [north, east]], e.g. the continental US. */
  bounds?: [[number, number], [number, number]];
  scrollWheelZoom?: boolean;
}

/* Base layers. USGS Topo is public domain and ideal for trails. */
const BASE_LAYERS = [
  {
    name: "USGS Topo",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles courtesy of the <a href="https://usgs.gov/">U.S. Geological Survey</a>',
    maxNativeZoom: 16,
  },
  {
    name: "OpenTopoMap",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxNativeZoom: 17,
  },
  {
    name: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maxNativeZoom: 18,
  },
  {
    name: "Streets (OSM)",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 19,
  },
];

function FitTo({ line, markers, fitMarkers, bounds }: { line?: [number, number][]; markers: MapMarker[]; fitMarkers?: boolean; bounds?: [[number, number], [number, number]] }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) return void map.fitBounds(bounds, { padding: [10, 10] });
    const pts: [number, number][] = [
      ...(line ?? []).map(([lon, lat]) => [lat, lon] as [number, number]),
      ...(fitMarkers ? markers.map((m) => [m.lat, m.lon] as [number, number]) : []),
    ];
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 13 });
    else if (pts.length === 1 && fitMarkers) map.setView(pts[0], Math.max(map.getZoom(), 11));
  }, [line, markers, fitMarkers, bounds, map]);
  return null;
}

/** Leaflet needs a nudge when its container is resized or un-hidden. */
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

/** Follows the list: pans to + opens the hovered item's pin (only pans if it's off-screen). */
function ActiveSync({ refs }: { refs: React.RefObject<Map<string, L.Marker>> }) {
  const map = useMap();
  const ex = useExplorer();
  useEffect(() => {
    if (!ex?.active || ex.source !== "list") return;
    const m = refs.current?.get(ex.active);
    if (!m) return;
    if (!map.getBounds().pad(-0.1).contains(m.getLatLng())) map.panTo(m.getLatLng(), { animate: true });
    m.openPopup();
  }, [ex?.active, ex?.source, map, refs]);
  return null;
}

function MarkerPopup({ m }: { m: MapMarker }) {
  return (
    <Popup className={m.image ? "info-popup has-image" : "info-popup"} autoPanPadding={[24, 24]} maxWidth={260} minWidth={m.image ? 240 : 50}>
      {m.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.image} alt="" className="info-popup-img" loading="lazy" />
      )}
      <div className="info-popup-body">
        <strong>{m.href ? <a href={m.href}>{m.label}</a> : m.label}</strong>
        {m.detail && <div className="info-popup-detail">{m.detail}</div>}
        {m.blurb && <div className="info-popup-blurb">{m.blurb}</div>}
        <div className="info-popup-links">
          {m.href && <a href={m.href}>View →</a>}
          <a href={googleDirections({ lat: m.lat, lon: m.lon })} target="_blank" rel="noopener">🧭 Directions</a>
        </div>
      </div>
    </Popup>
  );
}

/** Pulls live layers from our own API so keys stay server-side. */
function useLiveOverlays(parkCode?: string) {
  const [layers, setLayers] = useState<Record<string, MapMarker[]>>({});
  useEffect(() => {
    if (!parkCode) return;
    const get = (src: string) => fetch(`/api/parks/${parkCode}/${src}`).then((r) => r.json()).catch(() => null);
    // Each layer appears as soon as its own data arrives (a slow source can't hold up the others).
    const put = (name: string, ms: MapMarker[]) => setLayers((l) => ({ ...l, [name]: ms }));
    get("campgrounds").then((camps) => put("Campgrounds", (camps?.data ?? [])
      .filter((c: any) => c.latitude && c.longitude)
      .map((c: any) => ({ lat: +c.latitude, lon: +c.longitude, kind: "campground", label: c.name, href: c.reservationUrl || undefined, detail: `${c.campsites?.totalSites ?? "?"} sites` }))));
    get("rivers").then((rivers) => {
      const bySite = new Map<string, MapMarker>();
      for (const g of rivers?.data ?? []) {
        if (g.lat == null) continue;
        const m = bySite.get(g.siteId) ?? { lat: g.lat, lon: g.lon, kind: "riverGauge" as const, label: g.siteId, href: `https://waterdata.usgs.gov/monitoring-location/${g.siteId}/`, detail: "" };
        m.detail = [m.detail, `${g.value} ${g.unit}`].filter(Boolean).join(" · ");
        bySite.set(g.siteId, m);
      }
      put("River Gauges", [...bySite.values()]);
    });
    get("boatLaunches").then((boats) => put("Boat Launches", (boats?.data ?? []).map((f: any) => ({ lat: f.lat, lon: f.lon, kind: "boatLaunch", label: f.name }))));
    get("paddleSpots").then((paddle) => put("Kayak & Canoe Launches (OSM)", (paddle?.data ?? []).map((s: any) => ({ lat: s.lat, lon: s.lon, kind: "paddleSpot", label: s.name, detail: [s.typeLabel, s.detail].filter(Boolean).join(" · "), href: s.website || undefined }))));
  }, [parkCode]);
  return layers;
}

export default function LeafletMap({ center, zoom = 10, markers = [], line: singleLine, lines, lineDifficulty, parkCode, height = 420, fitMarkers, bounds, scrollWheelZoom = false }: LeafletMapProps) {
  const overlays = useLiveOverlays(parkCode);
  const allLines = useMemo(() => [...(singleLine?.length ? [singleLine] : []), ...(lines ?? [])].filter((l) => l.length > 1), [singleLine, lines]);
  const line = useMemo(() => allLines.flat(), [allLines]); // for fitting the view
  const ex = useExplorer();
  const refs = useRef(new Map<string, L.Marker>());
  const active = ex?.active ?? null;
  const activeRef = useRef(active);
  activeRef.current = active;
  // A list item can target one pin (id) or a group of pins (e.g. an activity).
  const osm = useOsmTrails();
  const useFilter = osm?.selected ?? [];
  const groupActive = useMemo(() => Boolean(active && markers.some((m) => m.groups?.includes(active))), [active, markers]);

  // Park maps: only the top few pins for the selected activity, until "Show all" is pressed.
  const parkMode = Boolean(parkCode && osm);
  // The selected activity, even when it has no trails of its own (camping, boating…): its pins are campgrounds, ramps…
  const activity = osm?.activity ?? null;
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setShowAll(false), [activity]);
  const shownMarkers = useMemo(() => {
    const passes = (m: MapMarker) => !m.uses || (osm ? osm.showsTrail({ uses: m.uses, activities: m.activities, trailType: m.trailType }) : useFilter.every((u) => m.uses!.includes(u)));
    if (!parkMode) return markers.filter(passes);
    return pinsForActivity({
      activity,
      featured: markers.filter((m) => m.kind === "trailhead" && passes(m)),
      campgrounds: markers.filter((m) => m.kind === "campground"),
      trails: osm?.visible ?? [],
      overlays,
    });
  }, [parkMode, activity, markers, overlays, osm, useFilter]);
  const pins = parkMode && !showAll
    ? [...shownMarkers.slice(0, TOP_PINS), ...markers.filter((m) => m.id && m.id === active && !shownMarkers.slice(0, TOP_PINS).includes(m))]
    : shownMarkers;
  const pillRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (pillRef.current) { L.DomEvent.disableClickPropagation(pillRef.current); L.DomEvent.disableScrollPropagation(pillRef.current); } });

  const pinLayer = (
    <LayerGroup>
      {allLines.length > 0 && (
        <Polyline positions={allLines.map((l) => l.map(([lon, lat]) => [lat, lon] as [number, number]))} pathOptions={{ color: DIFFICULTY_COLORS[lineDifficulty ?? ""] ?? "#c27a3a", weight: 5, opacity: 0.95 }} />
      )}
      {pins.map((m, i) => {
        const hit = active != null && (m.id === active || (m.groups?.includes(active) ?? false));
        return (
          <Marker
            key={m.id ?? `${m.kind}-${m.lat}-${m.lon}-${i}`}
            position={[m.lat, m.lon]}
            icon={markerIcon(m.kind, { difficulty: m.difficulty, selected: hit })}
            opacity={groupActive && !hit ? 0.3 : 1}
            zIndexOffset={hit ? 1000 : 0}
            ref={(r) => { if (m.id) { if (r) refs.current.set(m.id, r); else refs.current.delete(m.id); } }}
            eventHandlers={{
              // Hover (or tap) a pin: open its info popup and highlight + scroll to its row in the list.
              // Open the popup first: that closes the previous one, whose popupclose clears the old highlight.
              mouseover: (e) => { if (!m.id) return; e.target.openPopup(); ex?.setActive(m.id, "map"); },
              click: (e) => { if (!m.id) return; e.target.openPopup(); ex?.setActive(m.id, "map"); },
              popupclose: () => { if (m.id && activeRef.current === m.id) ex?.setActive(null, "map"); },
            }}
          >
            <MarkerPopup m={m} />
          </Marker>
        );
      })}
    </LayerGroup>
  );

  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom={scrollWheelZoom} style={{ height, width: "100%" }} className="map">
      <LayersControl position="topright">
        {BASE_LAYERS.map((b, i) => (
          <LayersControl.BaseLayer key={b.name} name={b.name} checked={i === 0}>
            <TileLayer url={b.url} attribution={b.attribution} maxNativeZoom={b.maxNativeZoom} maxZoom={19} />
          </LayersControl.BaseLayer>
        ))}

        {!parkMode && osm && osm.features.length > 0 && (
          <LayersControl.Overlay name="Trail Lines (OpenStreetMap)" checked>
            <OsmTrailsLayer />
          </LayersControl.Overlay>
        )}

        {!parkMode && (
          <LayersControl.Overlay name="Trails" checked>
            {pinLayer}
          </LayersControl.Overlay>
        )}

        {!parkMode && Object.entries(overlays).map(([name, ms]) =>
          ms.length ? (
            <LayersControl.Overlay key={name} name={`${name} (${ms.length})`} checked={name !== "River Gauges"}>
              <LayerGroup>
                {ms.map((m, i) => (
                  <Marker key={`${name}-${i}`} position={[m.lat, m.lon]} icon={markerIcon(m.kind)}>
                    <MarkerPopup m={m} />
                  </Marker>
                ))}
              </LayerGroup>
            </LayersControl.Overlay>
          ) : null,
        )}
      </LayersControl>
      {parkMode && osm && osm.features.length > 0 && <OsmTrailsLayer />}
      {parkMode && pinLayer}
      <ScaleControl position="bottomleft" imperial metric={false} />
      {parkMode && shownMarkers.length > TOP_PINS && (
        <div ref={pillRef} className="map-pill-wrap">
          <button type="button" className="map-pill" onClick={() => setShowAll((v) => !v)} aria-pressed={showAll}>
            {showAll ? `Show top ${TOP_PINS}` : `Show all ${shownMarkers.length}`}
          </button>
        </div>
      )}
      <FitTo line={line} markers={markers} fitMarkers={fitMarkers} bounds={bounds} />
      <ActiveSync refs={refs} />
      <AutoResize />
    </MapContainer>
  );
}
