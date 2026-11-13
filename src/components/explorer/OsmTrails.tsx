"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ExplorerItem } from "./Explorer";
import { allows, TRAIL_USES, USE_LABELS, type OsmTrailCollection, type OsmTrailFeature, type TrailUse } from "@/lib/osm-trails";

/**
 * OpenStreetMap trails for a park + the "Trail use" filter.
 * Data comes from /data/osm-trails/<park>.geojson (made by `npm run sync:osm`).
 * Map layer, list and curated trails all read the same selection.
 */
interface OsmState {
  /** "nps" (official import) or "osm" (fallback) */
  source: "nps" | "osm";
  features: OsmTrailFeature[];
  loaded: boolean;
  selected: TrailUse[];
  toggle: (u: TrailUse) => void;
  clear: () => void;
  visible: OsmTrailFeature[];
}

const Ctx = createContext<OsmState | null>(null);
export const useOsmTrails = () => useContext(Ctx);

export function OsmTrailsProvider({ parkCode, children }: { parkCode: string; children: React.ReactNode }) {
  const [features, setFeatures] = useState<OsmTrailFeature[]>([]);
  const [source, setSource] = useState<"nps" | "osm">("nps");
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<TrailUse[]>([]);

  useEffect(() => {
    let cancelled = false;
    const get = (url: string) => fetch(url).then((r) => (r.ok ? (r.json() as Promise<OsmTrailCollection>) : null)).catch(() => null);
    // Official NPS trails first; OpenStreetMap lines if the park hasn't been imported yet.
    get(`/api/parks/${parkCode}/trail-lines`)
      .then((fc) => (fc?.features.length ? fc : get(`/data/osm-trails/${parkCode}.geojson`).then((o) => (o ? { ...o, source: "osm" } : null))))
      .then((fc) => { if (!cancelled) { setFeatures(fc?.features ?? []); setSource((fc as { source?: string } | null)?.source === "osm" ? "osm" : "nps"); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [parkCode]);

  const value = useMemo<OsmState>(() => ({
    source, features, loaded, selected,
    toggle: (u) => setSelected((s) => (s.includes(u) ? s.filter((x) => x !== u) : [...s, u])),
    clear: () => setSelected([]),
    visible: selected.length ? features.filter((f) => allows(f.properties.uses, selected)) : features,
  }), [source, features, loaded, selected]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** "Trail use" chips with live counts. Multiple selections = trails allowing all of them. */
export function TrailUseFilter() {
  const osm = useOsmTrails();
  if (!osm) return null;
  const count = (u: TrailUse) => osm.features.filter((f) => f.properties.uses[u] === "yes").length;
  return (
    <div className="chips" style={{ margin: 0 }}>
      <button type="button" className={`chip ${osm.selected.length === 0 ? "active" : ""}`} onClick={osm.clear}>All trails</button>
      {TRAIL_USES.map((u) => (
        <button key={u} type="button" className={`chip ${osm.selected.includes(u) ? "active" : ""}`} aria-pressed={osm.selected.includes(u)} onClick={() => osm.toggle(u)}>
          {USE_LABELS[u].icon} {USE_LABELS[u].label}
          {osm.loaded && osm.features.length > 0 && <span className="chip-count">{count(u)}</span>}
        </button>
      ))}
    </div>
  );
}

const DIFF_ICON: Record<string, string> = { easy: "🟢", moderate: "🔵", hard: "🟠", "very-hard": "🔴" };

/** Right-hand list of OSM trails, filtered by trail use; hovering highlights the line. */
export function OsmTrailList({ initial = 25 }: { initial?: number }) {
  const osm = useOsmTrails();
  const [showAll, setShowAll] = useState(false);
  if (!osm) return null;
  if (!osm.loaded) return <div className="list-empty">Loading trails…</div>;
  if (!osm.features.length) return <div className="list-empty">Trails for this park haven&apos;t been imported yet (run <code>npm run sync:trails</code>).</div>;
  if (!osm.visible.length) return <div className="list-empty">No trails here are marked for {osm.selected.map((u) => USE_LABELS[u].label.toLowerCase()).join(" + ")}. Many park trails don&apos;t allow bikes or dogs.</div>;
  const list = showAll ? osm.visible : osm.visible.slice(0, initial);
  return (
    <>
      {list.map((f) => {
        const p = f.properties;
        const uses = TRAIL_USES.filter((u) => p.uses[u] === "yes").map((u) => USE_LABELS[u].icon).join(" ");
        return (
          <ExplorerItem
            key={p.id}
            id={p.id}
            href={p.href}
            icon={p.difficulty ? DIFF_ICON[p.difficulty] : "🥾"}
            title={p.name}
            meta={<>{p.lengthMi} mi{p.difficulty ? ` · ${p.difficulty.replace("-", " ")}` : ""}{p.surface ? ` · ${p.surface}` : ""}{uses ? <> · <span title="Allowed uses">{uses}</span></> : null}</>}
            search={p.name}
          />
        );
      })}
      {!showAll && osm.visible.length > initial && (
        <button type="button" className="list-more" onClick={() => setShowAll(true)}>Show all {osm.visible.length} trails</button>
      )}
    </>
  );
}

/** Hides a curated trail row when it doesn't allow the selected uses. */
export function UseGate({ uses, children }: { uses: string[]; children: React.ReactNode }) {
  const osm = useOsmTrails();
  if (osm?.selected.length && !osm.selected.every((u) => uses.includes(u))) return null;
  return <>{children}</>;
}
