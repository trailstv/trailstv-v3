"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { LayerGroup, Polyline, Popup, useMap } from "react-leaflet";
import { useOsmTrails } from "@/components/explorer/OsmTrails";
import { useExplorer } from "@/components/explorer/Explorer";
import { TRAIL_USES, USE_LABELS, type OsmTrailFeature } from "@/lib/osm-trails";
import { googleDirections } from "@/lib/directions";
import { DIFFICULTY_COLORS } from "./pins";

const ALLOW = { yes: "✓", no: "✕", null: "?" } as const;

/** OpenStreetMap trail lines, filtered by the selected trail uses and linked to the list. */
export function OsmTrailsLayer() {
  const osm = useOsmTrails();
  const ex = useExplorer();
  const map = useMap();
  const refs = useRef(new Map<string, L.Polyline>());

  // Hovering a trail in the list → bring it into view and open its popup.
  useEffect(() => {
    if (!ex?.active || ex.source !== "list") return;
    const line = refs.current.get(ex.active);
    if (!line) return;
    const b = line.getBounds();
    if (!map.getBounds().contains(b)) map.fitBounds(b, { padding: [60, 60], maxZoom: 15 });
    line.openPopup(b.getCenter());
  }, [ex?.active, ex?.source, map]);

  if (!osm?.visible.length) return null;

  return (
    <LayerGroup attribution={osm.source === "osm" ? 'Trails © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' : "Trails: National Park Service"}>
      {osm.visible.map((f: OsmTrailFeature) => {
        const p = f.properties;
        const active = ex?.active === p.id;
        const start = f.geometry.coordinates[0]?.[0];
        return (
          <Polyline
            key={p.id}
            ref={(r) => { if (r) refs.current.set(p.id, r); else refs.current.delete(p.id); }}
            positions={f.geometry.coordinates.map((line) => line.map(([lon, lat]) => [lat, lon] as [number, number]))}
            pathOptions={{
              color: active ? "#c27a3a" : (p.difficulty && DIFFICULTY_COLORS[p.difficulty]) || "#3a6a8c",
              weight: active ? 7 : 4,
              opacity: active ? 1 : 0.85,
              dashArray: p.difficulty ? undefined : "6 6",
              lineCap: "round",
            }}
            eventHandlers={{ click: () => ex?.setActive(p.id, "map"), mouseover: (e) => e.target.setStyle({ weight: 7 }), mouseout: (e) => !active && e.target.setStyle({ weight: 4 }) }}
          >
            <Popup>
              <strong>{p.name}</strong>
              <div>{p.lengthMi} mi{p.difficulty ? ` · ${p.difficulty.replace("-", " ")}` : ""}{p.surface ? ` · ${p.surface}` : ""}</div>
              <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "auto auto", gap: "2px 10px", fontSize: ".85rem" }}>
                {TRAIL_USES.map((u) => (
                  <span key={u} style={{ display: "contents" }}>
                    <span>{USE_LABELS[u].icon} {USE_LABELS[u].label}</span>
                    <b style={{ color: p.uses[u] === "yes" ? "#2f7a4a" : p.uses[u] === "no" ? "#b23c2e" : "#8c9aab" }}>{ALLOW[String(p.uses[u]) as keyof typeof ALLOW]}</b>
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 6, display: "flex", gap: 12 }}>
                {p.href && <a href={p.href}>Trail details →</a>}
                {start && <a href={googleDirections({ lat: start[1], lon: start[0] })} target="_blank" rel="noopener">🧭 Directions</a>}
              </div>
              <div style={{ marginTop: 4, fontSize: ".72rem", color: "#5a6877" }}>? = not recorded. Check posted rules.</div>
            </Popup>
          </Polyline>
        );
      })}
    </LayerGroup>
  );
}
