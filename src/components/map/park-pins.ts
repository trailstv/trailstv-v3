import type { MapMarker } from "./LeafletMap";
import type { OsmTrailFeature } from "@/lib/osm-trails";

/** How many pins a park map shows before "Show all". */
export const TOP_PINS = 3;

type Pool = "trailheads" | "campgrounds" | "paddle" | "boat" | "rivers";

/** Which pins each activity shows on a park map, in order of preference. */
const ACTIVITY_POOLS: Record<string, Pool[]> = {
  camping: ["campgrounds"],
  kayaking: ["paddle"],
  paddleboarding: ["paddle"],
  rafting: ["paddle", "rivers"],
  boating: ["boat", "paddle"],
  fishing: ["boat", "paddle", "rivers"],
  swimming: ["paddle"],
};

/** Start of a trail line as a trailhead pin. */
function trailStart(f: OsmTrailFeature): MapMarker | null {
  const first = f.geometry.coordinates[0]?.[0];
  if (!first) return null;
  const p = f.properties;
  return {
    id: `line-${p.id}`, lat: first[1], lon: first[0], kind: "trailhead",
    label: p.name, href: p.href, difficulty: p.difficulty ?? undefined,
    detail: [p.lengthMi ? `${p.lengthMi} mi` : "", p.trailType === "snow" ? "Snow route" : p.trailType === "water" ? "Water trail" : ""].filter(Boolean).join(" · "),
  };
}

const near = (a: MapMarker, b: MapMarker) => Math.abs(a.lat - b.lat) < 0.002 && Math.abs(a.lon - b.lon) < 0.002;

/** Add pins, skipping any already in the list (same name, or the same spot). */
function addUnique(out: MapMarker[], more: MapMarker[]) {
  for (const m of more) {
    if (!out.some((o) => (o.label && o.label === m.label) || (o.kind === m.kind && near(o, m)))) out.push(m);
  }
}

/**
 * Every pin that suits the selected activity, best first:
 * - trail activities: featured trails first, then the park's other matching trails, longest first
 * - camping: campgrounds; kayaking & paddling: launches, then water-trail starts; boating & fishing: ramps
 * The map shows the first TOP_PINS of these until "Show all" is pressed.
 */
export function pinsForActivity(opts: {
  activity: string | null;
  featured: MapMarker[]; // the page's trailhead pins, already filtered for the activity
  campgrounds: MapMarker[]; // the page's campground pins
  trails: OsmTrailFeature[]; // the park's trail lines for the activity
  overlays: Record<string, MapMarker[]>; // live layers: Campgrounds, Kayak & Canoe Launches (OSM), Boat Launches, River Gauges
}): MapMarker[] {
  const { activity, featured, campgrounds, trails, overlays } = opts;
  const trailheads = () => {
    const out: MapMarker[] = [...featured];
    addUnique(out, [...trails].sort((a, b) => (b.properties.lengthMi ?? 0) - (a.properties.lengthMi ?? 0)).map(trailStart).filter(Boolean) as MapMarker[]);
    return out;
  };
  const pool: Record<Pool, () => MapMarker[]> = {
    trailheads,
    campgrounds: () => { const out = [...campgrounds]; addUnique(out, overlays["Campgrounds"] ?? []); return out; },
    paddle: () => {
      const out = [...(overlays["Kayak & Canoe Launches (OSM)"] ?? [])];
      addUnique(out, trails.filter((f) => f.properties.trailType === "water").map(trailStart).filter(Boolean) as MapMarker[]);
      return out;
    },
    boat: () => [...(overlays["Boat Launches"] ?? [])],
    rivers: () => [...(overlays["River Gauges"] ?? [])],
  };
  const out: MapMarker[] = [];
  for (const p of ACTIVITY_POOLS[activity ?? ""] ?? ["trailheads"]) addUnique(out, pool[p]());
  // Nothing of that kind near this park → fall back to trailheads so the map is never empty.
  if (!out.length) addUnique(out, trailheads());
  return out;
}
