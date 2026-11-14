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
import { lineLengthMi, type OsmTrailCollection } from "../src/lib/osm-trails";
import {
  NPS_TRAILS_ENDPOINT, parseUses, classNumber, hasFmss, isMaintained, difficultyFrom, groupFeatures as groupFeaturesLib, isPublic, normName, trailSlug, fetchNpsTrailFeatures,
  type Line, type Use, type NpsFeature,
} from "../src/lib/nps-trails";
export { parseUses, classNumber, hasFmss, isMaintained, difficultyFrom };
export const groupFeatures = (f: NpsFeature[], o: { maintainedOnly?: boolean; minClass?: number } = {}) => groupFeaturesLib(f, { ...o, includeUnnamed });

const ROOT = process.cwd();
const args = process.argv.slice(2);
const withElevation = args.includes("--elevation");
const includeUnnamed = args.includes("--unnamed");
const allTrails = args.includes("--all-trails");
const minClassArg = (() => { const i = args.indexOf("--min-class"); return i >= 0 ? Number(args[i + 1]) : null; })();
const fromIdx = args.indexOf("--from-file");
const fromFile = fromIdx >= 0 ? args[fromIdx + 1] : null;
const codes = args.filter((a, i) => !a.startsWith("--") && (fromIdx < 0 || i !== fromIdx + 1) && args[i - 1] !== "--min-class");

interface Park { code: string; name: string; trailMinClass?: number }

const readJson = <T,>(p: string, fallback: T): T => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback);
const slug = trailSlug;
const norm = normName;

const USE_ACTIVITIES: Record<Use, string> = {
  hike: "hiking", bike: "mountain-biking", horse: "horseback-riding", snowshoe: "snowshoeing", ski: "cross-country-skiing", paddle: "kayaking", dog: "", wheelchair: "",
};

/* ---------------------------------- Fetching ---------------------------------- */

async function fetchPark(code: string): Promise<NpsFeature[]> {
  if (fromFile) return (readJson<{ features: NpsFeature[] }>(fromFile, { features: [] })).features;
  return fetchNpsTrailFeatures(code);
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
