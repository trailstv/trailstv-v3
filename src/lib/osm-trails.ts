/**
 * Shared by the import script and the browser: turns OpenStreetMap ways into
 * TrailsTV trails with "trail use" flags. No server-only code here.
 */

export type UseValue = "yes" | "no" | null; // null = not tagged in OSM
export const TRAIL_USES = ["hike", "bike", "horse", "dog", "wheelchair"] as const;
export type TrailUse = (typeof TRAIL_USES)[number];

export const USE_LABELS: Record<TrailUse, { label: string; icon: string }> = {
  hike: { label: "Hiking", icon: "🥾" },
  bike: { label: "Biking", icon: "🚵" },
  horse: { label: "Horses", icon: "🐎" },
  dog: { label: "Dogs", icon: "🐕" },
  wheelchair: { label: "Wheelchair", icon: "♿" },
};

export interface OsmTrailProps {
  id: string; // "osm-<park>-<slug>"
  name: string;
  lengthMi: number;
  uses: Record<TrailUse, UseValue>;
  difficulty: "easy" | "moderate" | "hard" | "very-hard" | null;
  surface: string | null;
  osmWays: number[];
  /** Link to the TrailsTV trail page (imported NPS / featured trails) */
  href?: string;
}

export type OsmTrailFeature = {
  type: "Feature";
  properties: OsmTrailProps;
  geometry: { type: "MultiLineString"; coordinates: [number, number][][] };
};
export type OsmTrailCollection = { type: "FeatureCollection"; attribution: string; generatedAt: string; park: string; features: OsmTrailFeature[] };

const YES = new Set(["yes", "designated", "permissive", "official", "leashed", "limited"]);
const NO = new Set(["no", "private", "dismount", "use_sidepath"]);
const tri = (v?: string): UseValue => (v == null ? null : YES.has(v) ? "yes" : NO.has(v) ? "no" : null);

/** Trail-use flags from OSM tags (highway type supplies sensible defaults). */
export function usesFromTags(t: Record<string, string>): Record<TrailUse, UseValue> {
  const hw = t.highway;
  return {
    hike: tri(t.foot) ?? (hw === "cycleway" || hw === "bridleway" ? null : "yes"),
    bike: tri(t.bicycle) ?? (hw === "cycleway" ? "yes" : t["mtb:scale"] ? "yes" : null),
    horse: tri(t.horse) ?? (hw === "bridleway" ? "yes" : null),
    dog: tri(t.dog),
    wheelchair: tri(t.wheelchair),
  };
}

/** SAC hiking scale → TrailsTV difficulty. */
export function difficultyFromTags(t: Record<string, string>): OsmTrailProps["difficulty"] {
  switch (t.sac_scale) {
    case "hiking": case "T1": return "easy";
    case "mountain_hiking": case "T2": return "moderate";
    case "demanding_mountain_hiking": case "T3": return "hard";
    case "alpine_hiking": case "demanding_alpine_hiking": case "difficult_alpine_hiking": case "T4": case "T5": case "T6": return "very-hard";
    default: return null;
  }
}

/**
 * Combine segments of one named trail. If any segment prohibits a use, the trail
 * is marked "no" (you can't ride/bike the whole thing); otherwise any "yes" wins.
 */
export function mergeUses(a: Record<TrailUse, UseValue>, b: Record<TrailUse, UseValue>) {
  const out = { ...a };
  for (const k of TRAIL_USES) out[k] = a[k] === "no" || b[k] === "no" ? "no" : a[k] === "yes" || b[k] === "yes" ? "yes" : null;
  return out;
}

const ORDER = ["easy", "moderate", "hard", "very-hard"] as const;
export const hardest = (a: OsmTrailProps["difficulty"], b: OsmTrailProps["difficulty"]) =>
  !a ? b : !b ? a : ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;

/** Does a trail allow every selected use? (Unknown counts as not allowed.) */
export const allows = (uses: Record<TrailUse, UseValue>, selected: TrailUse[]) => selected.every((u) => uses[u] === "yes");

export function lineLengthMi(coords: [number, number][]) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  let km = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1], [lon2, lat2] = coords[i];
    const h = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
    km += 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  return km * 0.621371;
}

/** Ramer–Douglas–Peucker line simplification (tolerance in degrees; 0.00004 ≈ 4 m). */
export function simplify(pts: [number, number][], tol = 0.00004): [number, number][] {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-12;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}
