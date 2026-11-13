/**
 * Import every trail in each national park from the official NPS Public Trails dataset.
 *
 *   npm run sync:trails                      # all parks
 *   npm run sync:trails -- zion yose         # specific parks
 *   npm run sync:trails -- zion --elevation  # also measure elevation gain (USGS, slow: run per park)
 *   npm run sync:trails -- zion --from-file nps-zion.geojson   # offline: use a saved query response
 *
 * Source: https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails_Geographic/FeatureServer/0
 * (public domain; public, existing trails only).
 *
 * Writes:
 *   content/trails/<park>.json          trail list (hand-written featured trails are kept and get real route lines)
 *   content/trail-geometry/<park>.json  route lines by trail id
 * Snow and water trails are imported too (for snowshoe/ski/paddling pages), marked trailType "snow"/"water".
 * If public/data/osm-trails/<park>.geojson exists (npm run sync:osm), dog/wheelchair access and SAC difficulty are added by name.
 *
 * MAINTAINED TRAILS ONLY (default). NPS has no single "maintained" flag, so a segment counts as maintained when:
 *   • it has an asset/location ID in FMSS (the NPS Facility Management Software System, i.e. the park maintains it), or
 *   • its trail class is 2–5 (Class 1 "Minimally Developed" = primitive routes, excluded).
 * Stricter per park: add "trailMinClass": 3 (or 4) to content/parks/<park>.json, or pass --min-class 3.
 * If a park hasn't recorded trail classes or FMSS IDs at all, its public trails are kept and a warning is printed.
 * Pass --all-trails to import unmaintained routes too.
 */
import fs from "node:fs";
import path from "node:path";
import { simplify, lineLengthMi, type OsmTrailCollection } from "../src/lib/osm-trails";

const ENDPOINT = process.env.NPS_TRAILS_URL ?? "https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails_Geographic/FeatureServer/0/query";
const ROOT = process.cwd();
const args = process.argv.slice(2);
const withElevation = args.includes("--elevation");
const includeUnnamed = args.includes("--unnamed");
const allTrails = args.includes("--all-trails");
const minClassArg = (() => { const i = args.indexOf("--min-class"); return i >= 0 ? Number(args[i + 1]) : null; })();
const fromIdx = args.indexOf("--from-file");
const fromFile = fromIdx >= 0 ? args[fromIdx + 1] : null;
const codes = args.filter((a, i) => !a.startsWith("--") && (fromIdx < 0 || i !== fromIdx + 1) && args[i - 1] !== "--min-class");
const PAGE = 2000;

type Line = [number, number][];
type Use = "hike" | "bike" | "horse" | "dog" | "wheelchair" | "snowshoe" | "ski" | "paddle";
interface NpsFeature { properties: Record<string, string | null>; geometry: { type: "LineString" | "MultiLineString"; coordinates: any } | null }
interface Park { code: string; name: string; trailMinClass?: number }

const readJson = <T,>(p: string, fallback: T): T => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback);
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const norm = (s: string) => slug(s.replace(/\b(trail|trailhead|the|loop|path|route)\b/gi, ""));

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

const trailType = (t: string | null): "terra" | "snow" | "water" => (/snow/i.test(t ?? "") ? "snow" : /water/i.test(t ?? "") ? "water" : "terra");
const isPublic = (p: Record<string, string | null>) =>
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

const USE_ACTIVITIES: Record<Use, string> = {
  hike: "hiking", bike: "mountain-biking", horse: "horseback-riding", snowshoe: "snowshoeing", ski: "cross-country-skiing", paddle: "kayaking", dog: "", wheelchair: "",
};

/** Shenandoah National Park's hiking difficulty rating: √(gain × 2 × miles). */
export function difficultyFrom(gainFt: number | null, miles: number) {
  if (gainFt == null) return null;
  const r = Math.sqrt(gainFt * 2 * miles);
  return r < 50 ? "easy" : r < 100 ? "moderate" : r < 200 ? "hard" : "very-hard";
}

/* ---------------------------------- Fetching ---------------------------------- */

async function fetchPark(code: string): Promise<NpsFeature[]> {
  if (fromFile) return (readJson<{ features: NpsFeature[] }>(fromFile, { features: [] })).features;
  const out: NpsFeature[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const body = new URLSearchParams({
      where: `UNITCODE='${code.toUpperCase()}'`, outFields: "*", returnGeometry: "true", outSR: "4326", geometryPrecision: "5",
      orderByFields: "OBJECTID", resultOffset: String(offset), resultRecordCount: String(PAGE), f: "geojson",
    });
    let res: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (res.ok) break;
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
    if (!res?.ok) throw new Error(`NPS trails ${res?.status} for ${code}`);
    const page = (await res.json()) as { features?: NpsFeature[]; error?: { message: string } };
    if (page.error) throw new Error(`NPS trails: ${page.error.message}`);
    out.push(...(page.features ?? []));
    if ((page.features?.length ?? 0) < PAGE) break;
  }
  return out;
}

/** USGS 3DEP elevation (feet) for a point. */
async function elevation(lon: number, lat: number): Promise<number | null> {
  try {
    const r = await fetch(`https://epqs.nationalmap.gov/v1/json?x=${lon}&y=${lat}&wkid=4326&units=Feet&includeDate=false`);
    const v = Number(((await r.json()) as { value?: string | number }).value);
    return Number.isFinite(v) && v > -1000 ? v : null;
  } catch { return null; }
}

/** Elevation gain along a route, sampled at up to 40 evenly spaced points (smoothed to ignore <10 ft noise). */
export async function measureGain(lines: Line[]): Promise<number | null> {
  const longest = [...lines].sort((a, b) => lineLengthMi(b) - lineLengthMi(a))[0];
  if (!longest || longest.length < 2) return null;
  const n = Math.min(40, Math.max(8, Math.round(lineLengthMi(longest) * 6)));
  const pts = Array.from({ length: n }, (_, i) => longest[Math.round((i * (longest.length - 1)) / (n - 1))]);
  const elev: (number | null)[] = [];
  for (let i = 0; i < pts.length; i += 6) elev.push(...(await Promise.all(pts.slice(i, i + 6).map(([lo, la]) => elevation(lo, la)))));
  const vals = elev.filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  let gain = 0, last = vals[0];
  for (const v of vals.slice(1)) { if (Math.abs(v - last) >= 10) { if (v > last) gain += v - last; last = v; } }
  return Math.round(gain);
}

/* ---------------------------------- Building ---------------------------------- */

interface Group { name: string; type: "terra" | "snow" | "water"; uses: Set<Use>; lines: Line[]; surface: string | null; trailClass: string | null; seasonal: boolean; closed: boolean }

export function groupFeatures(features: NpsFeature[], opts: { maintainedOnly?: boolean; minClass?: number } = {}): Group[] {
  const groups = new Map<string, Group>();
  for (const f of features) {
    const p = f.properties ?? {};
    if (!f.geometry || !isPublic(p)) continue;
    if (opts.maintainedOnly && !isMaintained(p, opts.minClass ?? 2)) continue;
    const name = (p.TRLNAME || p.MAPLABEL || p.TRLALTNAME || "").trim();
    if (!name && !includeUnnamed) continue;
    const type = trailType(p.TRLTYPE);
    const key = `${type}:${norm(name || "unnamed")}`;
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

async function syncPark(park: Park) {
  const trailsFile = path.join(ROOT, "content/trails", `${park.code}.json`);
  const geoFile = path.join(ROOT, "content/trail-geometry", `${park.code}.json`);
  const existing = readJson<any[]>(trailsFile, []);
  const curated = existing.filter((t) => t.source !== "nps");
  const previous = new Map(existing.filter((t) => t.source === "nps").map((t) => [t.id, t]));
  const osm = readJson<OsmTrailCollection | null>(path.join(ROOT, "public/data/osm-trails", `${park.code}.geojson`), null);
  const osmByName = new Map((osm?.features ?? []).map((f) => [norm(f.properties.name), f.properties]));

  const features = await fetchPark(park.code);
  const minClass = minClassArg ?? park.trailMinClass ?? 2;
  // Only filter if this park actually records trail class or FMSS IDs; otherwise keep all public trails.
  const publicFeatures = features.filter((f) => f.geometry && isPublic(f.properties ?? {}));
  const hasMaintenanceData = publicFeatures.some((f) => classNumber(f.properties.TRLCLASS) != null || hasFmss(f.properties));
  const maintainedOnly = !allTrails && hasMaintenanceData;
  const groups = groupFeatures(features, { maintainedOnly, minClass });
  const allGroups = maintainedOnly ? groupFeatures(features) : groups;
  const dropped = allGroups.filter((g) => g.type === "terra" && !groups.some((k) => k.type === g.type && norm(k.name) === norm(g.name)));
  const geometry: Record<string, Line[]> = {};
  const imported: any[] = [];

  for (const g of groups) {
    const miles = Math.round(g.lines.reduce((s, l) => s + lineLengthMi(l), 0) * 10) / 10;
    if (miles < 0.1) continue;
    const suffix = g.type === "terra" ? "" : `-${g.type}`;
    const id = `${park.code}-${slug(g.name)}${suffix}`;
    const match = g.type === "terra" ? curated.find((c) => c.id === id || norm(c.name) === norm(g.name)) : undefined;
    geometry[match?.id ?? id] = g.lines;
    if (match) { match.distanceMi ??= miles; continue; } // featured trail: keep hand-written data, add the real route

    const o = osmByName.get(norm(g.name));
    const uses = new Set(g.uses);
    if (o?.uses.dog === "yes") uses.add("dog");
    if (o?.uses.wheelchair === "yes") uses.add("wheelchair");
    const prev = previous.get(id);
    const gainFt = prev?.gainFt ?? (withElevation && g.type === "terra" ? await measureGain(g.lines) : null);
    const [lon, lat] = g.lines[0][0];
    imported.push({
      id, parkCode: park.code, name: g.name, distanceMi: miles, gainFt,
      routeType: null,
      difficulty: o?.difficulty ?? difficultyFrom(gainFt, miles),
      trailhead: { name: `${g.name} start`, lat, lon },
      permit: null,
      activities: [...new Set([...uses].map((u) => USE_ACTIVITIES[u]).filter(Boolean))],
      hazards: [], summary: "",
      uses: [...uses], source: "nps", trailType: g.type, maintained: maintainedOnly || undefined,
      surface: g.surface, trailClass: g.trailClass, seasonal: g.seasonal || undefined, closed: g.closed || undefined,
      verified: false,
    });
  }

  imported.sort((a, b) => b.distanceMi - a.distanceMi);
  fs.mkdirSync(path.dirname(geoFile), { recursive: true });
  fs.writeFileSync(trailsFile, JSON.stringify([...curated, ...imported], null, 1) + "\n");
  fs.writeFileSync(geoFile, JSON.stringify(geometry));
  const by = (t: string) => imported.filter((x) => x.trailType === t).length;
  const kb = Math.round(fs.statSync(geoFile).size / 1024);
  const miles = Math.round(imported.filter((x) => x.trailType === "terra").reduce((s, x) => s + x.distanceMi, 0));
  const note = allTrails ? "all public trails" : !hasMaintenanceData ? "⚠ no class/FMSS data, kept all public trails" : `maintained (${minClass <= 2 ? "FMSS or class ≥ 2" : `class ≥ ${minClass}`}), ${dropped.length} unmaintained routes skipped`;
  console.log(`${park.code.padEnd(5)} ${String(by("terra")).padStart(4)} trails ${String(miles).padStart(5)} mi  ${String(by("snow")).padStart(3)} snow  ${String(by("water")).padStart(3)} water  ${String(kb).padStart(5)} KB  ${park.name}  [${note}]`);
}

async function main() {
  const parks: Park[] = fs.readdirSync(path.join(ROOT, "content/parks")).filter((f) => f.endsWith(".json")).map((f) => readJson<Park>(path.join(ROOT, "content/parks", f), null as never));
  const targets = codes.length ? parks.filter((p) => codes.includes(p.code)) : parks;
  if (!targets.length) throw new Error(`No matching parks: ${codes.join(", ")}`);
  for (const p of targets.sort((a, b) => a.code.localeCompare(b.code))) {
    try { await syncPark(p); } catch (e) { console.error(`✗ ${p.code}: ${(e as Error).message}`); }
    if (!fromFile) await new Promise((r) => setTimeout(r, 1500));
  }
}

if (process.argv[1]?.includes("sync-trails")) main().catch((e) => { console.error(e); process.exit(1); });
