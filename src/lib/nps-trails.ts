/**
 * NPS Public Trails dataset: field rules shared by `npm run sync:trails` (build-time import)
 * and the live fallback in /api/parks/[code]/trail-lines (parks not imported yet).
 * Source: https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails_Geographic/FeatureServer/0
 */
import { simplify, lineLengthMi } from "./osm-trails";

export const NPS_TRAILS_ENDPOINT = process.env.NPS_TRAILS_URL ?? "https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails_Geographic/FeatureServer/0/query";

export type Line = [number, number][];
export type Use = "hike" | "bike" | "horse" | "dog" | "wheelchair" | "snowshoe" | "ski" | "paddle";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface NpsFeature { properties: Record<string, string | null>; geometry: { type: "LineString" | "MultiLineString"; coordinates: any } | null }

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
export const trailSlug = slug;
export const normName = (s: string) => slug(s.replace(/\b(trail|trailhead|the|loop|path|route)\b/gi, ""));

/* ------------------------------ NPS field mapping ------------------------------ */

const USE_MAP: [RegExp, Use][] = [
  [/hiker|pedestrian/i, "hike"], [/bicycle/i, "bike"], [/pack and saddle|horse|equestrian/i, "horse"],
  [/snowshoe/i, "snowshoe"], [/cross-country ski|ski/i, "ski"], [/non-motorized watercraft/i, "paddle"],
];

export function parseUses(trluse: string | null, type: "terra" | "snow" | "water"): Use[] {
  const parts = (trluse ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  const uses = new Set<Use>();
  for (const p of parts) for (const [re, u] of USE_MAP) if (re.test(p)) uses.add(u);
  // NPS default is "Unknown": a standard (terra) trail with no listed use is treated as a footpath.
  if (type === "terra" && (parts.length === 0 || parts.every((p) => /unknown|other/i.test(p)))) uses.add("hike");
  return [...uses];
}

export const trailType = (t: string | null): "terra" | "snow" | "water" => (/snow/i.test(t ?? "") ? "snow" : /water/i.test(t ?? "") ? "water" : "terra");
export const isPublic = (p: Record<string, string | null>) =>
  !/no public/i.test(p.PUBLICDISPLAY ?? "") && !/^(restricted|internal|secure|sensitive)/i.test((p.DATAACCESS ?? "").trim()) &&
  !/decommission|planned|proposed|abandon|retired|obliterat/i.test(p.TRLSTATUS ?? "");

/* ------------------------------- Maintained? ------------------------------- */

/** "Class 3: Developed" → 3; unknown → null. */
export function classNumber(v: string | null | undefined): number | null {
  const m = String(v ?? "").match(/class\s*([1-5])|^\s*(?:TC)?([1-5])\b/i);
  return m ? Number(m[1] ?? m[2]) : null;
}

const FMSS_FIELDS = ["FACLOCID", "FACASSETID", "FMSSID", "FMSS_ID", "ASSETID", "LOCATIONID", "FEATUREID"];
/** Has an FMSS maintenance asset/location ID (i.e. the park tracks it for maintenance). */
export function hasFmss(p: Record<string, string | null>) {
  return FMSS_FIELDS.some((f) => { const v = String(p[f] ?? "").trim(); return v !== "" && !/^(unknown|null|n\/a|none|0)$/i.test(v); });
}

/**
 * Maintained?
 *  default (minClass 2): in FMSS, or trail class ≥ 2.
 *  stricter (minClass 3–5): class must meet the bar; FMSS decides only when class isn't recorded.
 */
export function isMaintained(p: Record<string, string | null>, minClass = 2) {
  const c = classNumber(p.TRLCLASS);
  if (minClass <= 2) return hasFmss(p) || (c != null && c >= 2);
  return c != null ? c >= minClass : hasFmss(p);
}

/** Shenandoah National Park's hiking difficulty rating: √(gain × 2 × miles). */
export function difficultyFrom(gainFt: number | null, miles: number) {
  if (gainFt == null) return null;
  const r = Math.sqrt(gainFt * 2 * miles);
  return r < 50 ? "easy" : r < 100 ? "moderate" : r < 200 ? "hard" : "very-hard";
}

export interface Group { name: string; type: "terra" | "snow" | "water"; uses: Set<Use>; lines: Line[]; surface: string | null; trailClass: string | null; seasonal: boolean; closed: boolean }

export function groupFeatures(features: NpsFeature[], opts: { maintainedOnly?: boolean; minClass?: number; includeUnnamed?: boolean } = {}): Group[] {
  const groups = new Map<string, Group>();
  for (const f of features) {
    const p = f.properties ?? {};
    if (!f.geometry || !isPublic(p)) continue;
    if (opts.maintainedOnly && !isMaintained(p, opts.minClass ?? 2)) continue;
    const name = (p.TRLNAME || p.MAPLABEL || p.TRLALTNAME || "").trim();
    if (!name && !opts.includeUnnamed) continue;
    const type = trailType(p.TRLTYPE);
    const key = `${type}:${normName(name || "unnamed")}`;
    const raw: Line[] = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const lines = raw.filter((l) => l.length > 1).map((l) => simplify(l.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5] as [number, number])));
    const g = groups.get(key) ?? { name: name || "Unnamed trail", type, uses: new Set<Use>(), lines: [], surface: null, trailClass: null, seasonal: false, closed: false };
    parseUses(p.TRLUSE, type).forEach((u) => g.uses.add(u));
    g.lines.push(...lines);
    g.surface ??= p.TRLSURFACE && !/unknown/i.test(p.TRLSURFACE) ? p.TRLSURFACE : null;
    g.trailClass ??= p.TRLCLASS && !/unknown/i.test(p.TRLCLASS) ? p.TRLCLASS : null;
    g.seasonal ||= /^(y|yes|true)$/i.test(String(p.SEASONAL ?? ""));
    g.closed ||= /closed/i.test(p.TRLSTATUS ?? "");
    groups.set(key, g);
  }
  return [...groups.values()];
}


/** True when the park records trail class or FMSS IDs, so "maintained" can be judged. */
export function hasMaintenanceData(features: NpsFeature[]) {
  return features.some((f) => f.geometry && isPublic(f.properties ?? {}) && (classNumber(f.properties.TRLCLASS) != null || hasFmss(f.properties)));
}

export const groupMiles = (g: Group) => Math.round(g.lines.reduce((s, l) => s + lineLengthMi(l), 0) * 10) / 10;

/** All of a park's trail segments (GeoJSON, WGS84), paging through the service. */
export async function fetchNpsTrailFeatures(code: string, init: RequestInit & { next?: { revalidate?: number } } = {}): Promise<NpsFeature[]> {
  const PAGE = 2000;
  const out: NpsFeature[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const body = new URLSearchParams({
      where: `UNITCODE='${code.toUpperCase().replace(/[^A-Z]/g, "")}'`, outFields: "*", returnGeometry: "true", outSR: "4326", geometryPrecision: "5",
      orderByFields: "OBJECTID", resultOffset: String(offset), resultRecordCount: String(PAGE), f: "geojson",
    });
    let res: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      // GET so the server's data cache can keep the response (POSTs are never cached).
      res = await fetch(`${NPS_TRAILS_ENDPOINT}?${body}`, init);
      if (res.ok) break;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
    if (!res?.ok) throw new Error(`NPS trails ${res?.status} for ${code}`);
    const page = (await res.json()) as { features?: NpsFeature[]; error?: { message: string } };
    if (page.error) throw new Error(`NPS trails: ${page.error.message}`);
    out.push(...(page.features ?? []));
    if ((page.features?.length ?? 0) < PAGE) break;
  }
  return out;
}
