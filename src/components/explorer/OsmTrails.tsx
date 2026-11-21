"use client";

import { createContext, Suspense, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExplorerItem } from "./Explorer";
import { allows, matchesActivity, ACTIVITY_TRAILS, TRAIL_USES, USE_LABELS, type OsmTrailCollection, type OsmTrailFeature, type OsmTrailProps, type TrailUse } from "@/lib/osm-trails";

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
  /** Activity picked with the park page's activity buttons (?activity=…) */
  activity: string | null;
  /** The activity's own trails, before the trail-use filter */
  base: OsmTrailFeature[];
  /** No trails are tagged for this activity, so the standard hiking list is shown instead */
  fallback: boolean;
  /** Should a featured-trail row / pin show with the current activity + trail-use selection? */
  showsTrail: (t: { uses: string[]; activities?: string[]; trailType?: "terra" | "snow" | "water" }) => boolean;
}

const Ctx = createContext<OsmState | null>(null);
export const useOsmTrails = () => useContext(Ctx);

export function OsmTrailsProvider({ parkCode, children }: { parkCode: string; children: React.ReactNode }) {
  const [features, setFeatures] = useState<OsmTrailFeature[]>([]);
  const [source, setSource] = useState<"nps" | "osm">("nps");
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<TrailUse[]>([]);
  const [activity, setActivity] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const get = (url: string) => fetch(url).then((r) => (r.ok ? (r.json() as Promise<OsmTrailCollection>) : null)).catch(() => null);
    // Official NPS trails first; OpenStreetMap lines if the park hasn't been imported yet.
    get(`/api/parks/${parkCode}/trail-lines`)
      .then((fc) => (fc?.features.length ? fc : get(`/data/osm-trails/${parkCode}.geojson`).then((o) => (o ? { ...o, source: "osm" } : null))))
      .then((fc) => { if (!cancelled) { setFeatures(fc?.features ?? []); setSource((fc as { source?: string } | null)?.source === "osm" ? "osm" : "nps"); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [parkCode]);

  const value = useMemo<OsmState>(() => {
    let base = features.filter((f) => matchesActivity(f.properties, activity));
    // Activities with no trail rule (fishing, stargazing…) and nothing tagged: keep the hiking list.
    const fallback = Boolean(activity && !base.length && !ACTIVITY_TRAILS[activity]);
    if (fallback) base = features.filter((f) => matchesActivity(f.properties, null));
    const act = fallback ? null : activity;
    return {
      source, features, loaded, selected, activity, base, fallback,
      toggle: (u) => setSelected((s) => (s.includes(u) ? s.filter((x) => x !== u) : [...s, u])),
      clear: () => setSelected([]),
      visible: selected.length ? base.filter((f) => allows(f.properties.uses, selected)) : base,
      showsTrail: (t) => {
        if (selected.length && !selected.every((u) => t.uses.includes(u))) return false;
        if (!act) return true; // featured trails always show on the overview
        const props: OsmTrailProps = {
          id: "", name: "", lengthMi: 0, difficulty: null, surface: null, osmWays: [], trailType: t.trailType, activities: t.activities,
          uses: Object.fromEntries(TRAIL_USES.map((u) => [u, t.uses.includes(u) ? "yes" : null])) as OsmTrailProps["uses"],
        };
        return matchesActivity(props, act);
      },
    };
  }, [source, features, loaded, selected, activity]);

  return (
    <Ctx.Provider value={value}>
      <Suspense fallback={null}><ActivitySync onChange={setActivity} /></Suspense>
      {children}
    </Ctx.Provider>
  );
}

/** Mirrors ?activity=… (set by the park page's activity buttons) into the trail filter. */
function ActivitySync({ onChange }: { onChange: (a: string | null) => void }) {
  const a = useSearchParams().get("activity");
  useEffect(() => onChange(a), [a, onChange]);
  return null;
}

/** "All Hiking Trails" heading that follows the selected activity. */
export function TrailListHeading() {
  const osm = useOsmTrails();
  const rule = osm?.activity && !osm.fallback ? ACTIVITY_TRAILS[osm.activity] : undefined;
  const label = !osm?.activity || osm.fallback ? "All Hiking Trails" : rule?.label ?? "Trails for This Activity";
  return (
    <h3 style={{ margin: 0 }}>
      {label}
      {osm?.loaded && osm.features.length > 0 && <span className="small muted" style={{ fontWeight: 400 }}> ({osm.visible.length})</span>}
    </h3>
  );
}

/** "Trail use" chips with live counts. Multiple selections = trails allowing all of them. */
export function TrailUseFilter() {
  const osm = useOsmTrails();
  if (!osm) return null;
  const count = (u: TrailUse) => osm.base.filter((f) => f.properties.uses[u] === "yes").length;
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
  if (!osm.features.length) return <div className="list-empty">The trail list for this park isn&apos;t available right now. Please check back soon.</div>;
  if (!osm.base.length && osm.activity) {
    const water = ACTIVITY_TRAILS[osm.activity]?.type === "water";
    return (
      <div className="list-empty">
        {water
          ? <>No paddling routes are mapped in this park. Kayak and canoe launches are on the map and under Live Conditions.</>
          : <>No {(ACTIVITY_TRAILS[osm.activity]?.label ?? "trails").toLowerCase()} are mapped in this park.</>}
      </div>
    );
  }
  if (!osm.visible.length) return <div className="list-empty">No trails here are marked for {osm.selected.map((u) => USE_LABELS[u].label.toLowerCase()).join(" + ")}. Many park trails don&apos;t allow bikes or dogs.</div>;
  const list = showAll ? osm.visible : osm.visible.slice(0, initial);
  return (
    <>
      {osm.fallback && <div className="list-empty" style={{ textAlign: "left" }}>No trails are tagged for this activity, so here are all the hiking trails.</div>}
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

/** Hides a featured trail row when it doesn't suit the selected activity or trail uses. */
export function UseGate({ uses, activities, trailType, children }: { uses: string[]; activities?: string[]; trailType?: "terra" | "snow" | "water"; children: React.ReactNode }) {
  const osm = useOsmTrails();
  if (osm && !osm.showsTrail({ uses, activities, trailType })) return null;
  return <>{children}</>;
}

/** Hides the "Featured Trails" heading when none of them suit the selection. */
export function FeaturedGate({ trails, children }: { trails: { uses: string[]; activities?: string[]; trailType?: "terra" | "snow" | "water" }[]; children: React.ReactNode }) {
  const osm = useOsmTrails();
  if (osm && !trails.some((t) => osm.showsTrail(t))) return null;
  return <>{children}</>;
}
