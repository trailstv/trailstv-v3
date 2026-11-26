import "server-only";
import type { SourceResult } from "../types";

/**
 * Kayak & canoe spots from OpenStreetMap, via the Overpass API.
 *
 * Looks around a park for:
 *   - canoe=put_in / egress           (paddling put-ins and take-outs)
 *   - whitewater=put_in / egress      (river runs)
 *   - leisure=slipway                 (boat ramps that hand-launch boats can use)
 *   - amenity=boat_rental             (kayak / canoe / SUP rentals)
 *
 * Results are cached for 7 days per park (Next.js Data Cache), so the shared
 * Overpass server sees at most a few requests a week. Set OVERPASS_URL to use
 * another Overpass instance.
 */

const ATTR = "© OpenStreetMap contributors (ODbL), via Overpass API";
const ENDPOINTS = [
  process.env.OVERPASS_URL,
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
].filter(Boolean) as string[];
/** Give up on one server after this long, and on all of them after BUDGET_MS. */
const PER_TRY_MS = 6000;
const BUDGET_MS = 12000;
/** After every server failed, don't ask again for this long (per park area). */
const FAIL_TTL_MS = 10 * 60 * 1000;
const recentFailures = new Map<string, { at: number; error: string }>();
const WEEK = 7 * 86400;

export type PaddleSpotType = "put-in" | "take-out" | "put-in-take-out" | "whitewater" | "ramp" | "rental";

export interface PaddleSpot {
  id: string;
  name: string;
  type: PaddleSpotType;
  typeLabel: string;
  lat: number;
  lon: number;
  /** Extra details from OSM tags: fee, parking, water body, boats rented… */
  detail: string;
  osmUrl: string;
  website?: string;
}

const TYPE_LABELS: Record<PaddleSpotType, string> = {
  "put-in": "Put-in",
  "take-out": "Take-out",
  "put-in-take-out": "Put-in & Take-out",
  whitewater: "Whitewater Access",
  ramp: "Boat Ramp",
  rental: "Kayak & Canoe Rental",
};

/** Paddle craft an OSM boat_rental may list (boat:kayak=yes etc.). */
const PADDLE_BOATS = ["kayak", "canoe", "sup", "standup_paddleboard", "raft", "pedalboat", "rowboat"];

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function query(lat: number, lon: number, radiusM: number) {
  const a = `(around:${radiusM},${lat.toFixed(5)},${lon.toFixed(5)})`;
  return `[out:json][timeout:25];(
nwr["canoe"~"put_in|egress"]${a};
nwr["whitewater"~"put_in|egress"]${a};
nwr["leisure"="slipway"]${a};
nwr["amenity"="boat_rental"]${a};
);out center tags 400;`;
}

function classify(t: Record<string, string>): PaddleSpotType | null {
  if (["private", "no"].includes(t.access ?? "")) return null;
  const canoe = t.canoe ?? "", ww = t.whitewater ?? "";
  if (ww.includes("put_in") || ww.includes("egress")) return "whitewater";
  if (canoe.includes("put_in") && canoe.includes("egress")) return "put-in-take-out";
  if (canoe.includes("put_in")) return "put-in";
  if (canoe.includes("egress")) return "take-out";
  if (t.leisure === "slipway") return canoe === "no" ? null : "ramp";
  if (t.amenity === "boat_rental") {
    const listed = Object.keys(t).filter((k) => k.startsWith("boat:"));
    // No boat:* tags = unknown fleet; keep it. Otherwise keep only if it rents paddle craft.
    if (!listed.length || PADDLE_BOATS.some((b) => t[`boat:${b}`] === "yes")) return "rental";
    return null;
  }
  return null;
}

function details(t: Record<string, string>, type: PaddleSpotType) {
  const bits: string[] = [];
  if (type === "rental") {
    const boats = PADDLE_BOATS.filter((b) => t[`boat:${b}`] === "yes").map((b) => (b === "standup_paddleboard" || b === "sup" ? "SUP" : b));
    if (boats.length) bits.push([...new Set(boats)].join(", "));
  }
  const water = t["water"] ?? t["waterway:name"] ?? t["river"] ?? t["lake"];
  if (water) bits.push(water);
  if (t.fee === "yes") bits.push("fee");
  else if (t.fee === "no") bits.push("free");
  if (t.parking === "yes" || t["parking"] === "surface") bits.push("parking");
  if (t.seasonal === "yes" || t.opening_hours) bits.push(t.opening_hours ? `hours: ${t.opening_hours}` : "seasonal");
  if (t["whitewater:section_grade"] || t["whitewater:rapid_grade"]) bits.push(`class ${t["whitewater:section_grade"] ?? t["whitewater:rapid_grade"]}`);
  return bits.join(" · ");
}

export function toSpots(elements: OsmElement[]): PaddleSpot[] {
  const out: PaddleSpot[] = [];
  const seen = new Set<string>();
  for (const e of elements) {
    const t = e.tags ?? {};
    const type = classify(t);
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (!type || lat == null || lon == null) continue;
    const name = t.name ?? t.description?.slice(0, 60) ?? TYPE_LABELS[type];
    // Same name at (nearly) the same spot = one place mapped twice (e.g. node + area).
    const key = `${name}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `osm-${e.type}-${e.id}`,
      name,
      type,
      typeLabel: TYPE_LABELS[type],
      lat: +lat.toFixed(6),
      lon: +lon.toFixed(6),
      detail: details(t, type),
      osmUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      website: t.website ?? t["contact:website"],
    });
  }
  // Named paddling access first, then ramps, then rentals.
  const rank: Record<PaddleSpotType, number> = { "put-in-take-out": 0, "put-in": 0, whitewater: 1, "take-out": 2, ramp: 3, rental: 4 };
  return out.sort((a, b) => rank[a.type] - rank[b.type] || a.name.localeCompare(b.name));
}

export async function getPaddleSpots(lat: number, lon: number, radiusKm: number): Promise<SourceResult<PaddleSpot[]>> {
  const fetchedAt = new Date().toISOString();
  // Big parks: cap the circle so one query stays fast on the shared server.
  const radiusM = Math.round(Math.min(Math.max(radiusKm, 15), 70) * 1000);
  const body = query(lat, lon, radiusM);
  const failed = recentFailures.get(body);
  if (failed && Date.now() - failed.at < FAIL_TTL_MS) {
    return { source: "osm-overpass", ok: false, fetchedAt, attribution: ATTR, error: failed.error };
  }
  const started = Date.now();
  let lastError = "";
  for (const endpoint of ENDPOINTS) {
    const left = BUDGET_MS - (Date.now() - started);
    if (left < 1500) break;
    try {
      const res = await fetch(`${endpoint}?data=${encodeURIComponent(body)}`, {
        headers: { Accept: "application/json", "User-Agent": "TrailsTV/1.0 (https://trailstv.com)" },
        next: { revalidate: WEEK, tags: ["osm-paddle"] },
        signal: AbortSignal.timeout(Math.min(PER_TRY_MS, left)),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as { elements?: OsmElement[]; remark?: string };
      if (!raw.elements) throw new Error(raw.remark ?? "No data");
      recentFailures.delete(body);
      return { source: "osm-overpass", ok: true, fetchedAt, attribution: ATTR, data: toSpots(raw.elements) };
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  const error = `OpenStreetMap's Overpass servers are busy right now (${lastError}). Try again in a few minutes.`;
  recentFailures.set(body, { at: Date.now(), error });
  return { source: "osm-overpass", ok: false, fetchedAt, attribution: ATTR, error };
}
