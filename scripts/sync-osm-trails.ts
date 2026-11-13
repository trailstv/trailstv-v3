/**
 * Import trail lines + trail-use tags from OpenStreetMap for each park.
 *
 *   npm run sync:osm                 # every park (polite: one park at a time, pauses between)
 *   npm run sync:osm -- zion yose    # specific parks
 *   npm run sync:osm -- zion --unnamed      # also include unnamed paths
 *   npm run sync:osm -- --from-file overpass.json zion   # offline: transform a saved Overpass response
 *
 * Writes public/data/osm-trails/<park>.geojson (served as a static file by Vercel's CDN).
 * Re-run occasionally (monthly is plenty) and commit the results.
 *
 * Data © OpenStreetMap contributors, available under the Open Database License (ODbL).
 */
import fs from "node:fs";
import path from "node:path";
import {
  usesFromTags, difficultyFromTags, mergeUses, hardest, lineLengthMi, simplify,
  type OsmTrailCollection, type OsmTrailFeature,
} from "../src/lib/osm-trails";

const ENDPOINT = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const OUT = path.join(process.cwd(), "public", "data", "osm-trails");
const args = process.argv.slice(2);
const includeUnnamed = args.includes("--unnamed");
const fromFileIdx = args.indexOf("--from-file");
const fromFile = fromFileIdx >= 0 ? args[fromFileIdx + 1] : null;
const codes = args.filter((a, i) => !a.startsWith("--") && i !== fromFileIdx + 1);

interface Park { code: string; name: string; lat: number; lon: number; radiusKm: number }
interface OverpassWay { type: "way"; id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }

const parks: Park[] = fs.readdirSync(path.join(process.cwd(), "content/parks")).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "content/parks", f), "utf8")));

const TRAIL_HIGHWAYS = "path|footway|bridleway|cycleway|track|steps";

function query(p: Park, mode: "area" | "bbox") {
  const filter = `["highway"~"^(${TRAIL_HIGHWAYS})$"]${includeUnnamed ? "" : '["name"]'}["access"!~"^(private|no)$"]`;
  if (mode === "area") {
    // The park's own boundary polygon in OSM (exact name match; Sequoia & Kings Canyon are two areas).
    const names = p.code === "seki" ? ["Sequoia National Park", "Kings Canyon National Park"] : [p.name];
    const areas = names.map((n) => `area["boundary"~"^(national_park|protected_area)$"]["name"="${n.replace(/"/g, '\\"')}"];`).join("");
    return `[out:json][timeout:240];(${areas})->.p;way(area.p)${filter};out tags geom;`;
  }
  const dLat = p.radiusKm / 111, dLon = p.radiusKm / (111 * Math.cos((p.lat * Math.PI) / 180));
  return `[out:json][timeout:240];way(${p.lat - dLat},${p.lon - dLon},${p.lat + dLat},${p.lon + dLon})${filter};out tags geom;`;
}

async function overpass(q: string): Promise<OverpassWay[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "TrailsTV trail sync (https://github.com/your-org/trailstv)" },
      body: "data=" + encodeURIComponent(q),
    });
    if (res.ok) return ((await res.json()) as { elements: OverpassWay[] }).elements.filter((e) => e.type === "way");
    if (res.status === 429 || res.status === 504) { await new Promise((r) => setTimeout(r, 15000 * attempt)); continue; }
    throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  throw new Error("Overpass busy; try again later or set OVERPASS_URL to another instance");
}

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Group OSM ways into named trails with merged trail-use flags. */
export function buildCollection(p: Park, ways: OverpassWay[]): OsmTrailCollection {
  const byName = new Map<string, OsmTrailFeature>();
  for (const w of ways) {
    if (!w.geometry || w.geometry.length < 2) continue;
    const tags = w.tags ?? {};
    if (/^(private|no)$/.test(tags.access ?? "")) continue; // closed to the public
    const name = tags.name ?? `Unnamed ${tags.highway ?? "path"}`;
    const line = simplify(w.geometry.map((g) => [Math.round(g.lon * 1e5) / 1e5, Math.round(g.lat * 1e5) / 1e5] as [number, number]));
    const id = `osm-${p.code}-${tags.name ? slug(name) : `way-${w.id}`}`;
    const existing = byName.get(id);
    if (existing) {
      existing.geometry.coordinates.push(line);
      existing.properties.uses = mergeUses(existing.properties.uses, usesFromTags(tags));
      existing.properties.difficulty = hardest(existing.properties.difficulty, difficultyFromTags(tags));
      existing.properties.surface ??= tags.surface ?? null;
      existing.properties.osmWays.push(w.id);
    } else {
      byName.set(id, {
        type: "Feature",
        properties: { id, name, lengthMi: 0, uses: usesFromTags(tags), difficulty: difficultyFromTags(tags), surface: tags.surface ?? null, osmWays: [w.id] },
        geometry: { type: "MultiLineString", coordinates: [line] },
      });
    }
  }
  const features = [...byName.values()]
    .map((f) => ({ ...f, properties: { ...f.properties, lengthMi: Math.round(f.geometry.coordinates.reduce((s, l) => s + lineLengthMi(l), 0) * 10) / 10 } }))
    .filter((f) => f.properties.lengthMi >= 0.1)
    .sort((a, b) => b.properties.lengthMi - a.properties.lengthMi);
  return { type: "FeatureCollection", attribution: "© OpenStreetMap contributors (ODbL)", generatedAt: new Date().toISOString(), park: p.code, features };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const targets = codes.length ? parks.filter((p) => codes.includes(p.code)) : parks;
  if (!targets.length) throw new Error(`No matching parks for: ${codes.join(", ")}`);

  for (const p of targets) {
    let ways: OverpassWay[];
    if (fromFile) {
      ways = (JSON.parse(fs.readFileSync(fromFile, "utf8")) as { elements: OverpassWay[] }).elements.filter((e) => e.type === "way");
    } else {
      ways = await overpass(query(p, "area"));
      if (!ways.length) ways = await overpass(query(p, "bbox")); // boundary not found by name → use the park's box
      await new Promise((r) => setTimeout(r, 4000)); // be polite to the shared Overpass server
    }
    const fc = buildCollection(p, ways);
    const file = path.join(OUT, `${p.code}.geojson`);
    fs.writeFileSync(file, JSON.stringify(fc));
    const kb = Math.round(fs.statSync(file).size / 1024);
    const count = (u: keyof OsmTrailFeature["properties"]["uses"]) => fc.features.filter((f) => f.properties.uses[u] === "yes").length;
    console.log(`${p.code.padEnd(5)} ${String(fc.features.length).padStart(4)} trails  ${String(kb).padStart(5)} KB  🥾${count("hike")} 🚵${count("bike")} 🐎${count("horse")} 🐕${count("dog")} ♿${count("wheelchair")}  ${p.name}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
