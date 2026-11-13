import "server-only";
import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import type { Activity, Park, Trail, TrailUseKey } from "./types";

const CONTENT = path.join(process.cwd(), "content");

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(CONTENT, file), "utf8")) as T;
}

function readDir<T>(dir: string): T[] {
  const full = path.join(CONTENT, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<T>(path.join(dir, f)));
}

export const getActivities = cache((): Activity[] => readJson<Activity[]>("activities.json"));

export const getActivity = (slug: string) => getActivities().find((a) => a.slug === slug);

export const getParks = cache((): Park[] =>
  readDir<Park>("parks").sort((a, b) => a.name.localeCompare(b.name)),
);

export const getPark = (code: string) => getParks().find((p) => p.code === code.toLowerCase());

export const getTrails = cache((): Trail[] => readDir<Trail[]>("trails").flat());

export const getTrailsForPark = (code: string) => getTrails().filter((t) => t.parkCode === code);

export const getTrail = (id: string) => getTrails().find((t) => t.id === id);

export const getParksForActivity = (slug: string) =>
  getParks().filter((p) => p.activities.includes(slug));

/** The 48 contiguous states + DC (excludes Alaska, Hawaiʻi and territories). */
const NON_CONTINENTAL = new Set(["AK", "HI", "AS", "VI", "PR", "GU", "MP"]);
export const isContinental = (p: Park) => !p.states.some((s) => NON_CONTINENTAL.has(s));

/** Map view of the contiguous United States. */
export const CONTINENTAL_BOUNDS: [[number, number], [number, number]] = [[24.4, -124.9], [49.4, -66.9]];

/** Official park count: Sequoia & Kings Canyon are two parks managed as one unit (one entry here). */
export const parkCount = (parks: Park[]) => parks.length + (parks.some((p) => p.code === "seki") ? 1 : 0);

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii Hawaiʻi", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  AS: "American Samoa", VI: "Virgin Islands", PR: "Puerto Rico", GU: "Guam", MP: "Northern Mariana Islands",
};
/** Text a park can be found by: name, state codes and full state names. */
export const parkSearchText = (p: Park) => `${p.name} ${p.states.join(" ")} ${p.states.map((s) => STATE_NAMES[s] ?? "").join(" ")}`;

/** Trail uses for a curated trail, from its activities. */
export function trailUses(t: Trail): TrailUseKey[] {
  const map: Record<string, TrailUseKey> = { hiking: "hike", backpacking: "hike", "mountain-biking": "bike", "horseback-riding": "horse", snowshoeing: "snowshoe", "cross-country-skiing": "ski", kayaking: "paddle" };
  return [...new Set([...t.activities.map((a) => map[a]).filter(Boolean), ...(t.uses ?? [])])];
}

/* ---------------------------- Imported trail routes ---------------------------- */

/** Route lines for a park's trails, by trail id (content/trail-geometry/<park>.json from `npm run sync:trails`). */
export const getParkTrailGeometry = cache((parkCode: string): Record<string, [number, number][][]> => {
  const f = path.join(CONTENT, "trail-geometry", `${parkCode}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
});

/** A trail's route as one or more lines: hand-entered geometry first, else the imported NPS route. */
export function getTrailLines(t: Trail): [number, number][][] {
  if (t.geometry?.length) return [t.geometry];
  return getParkTrailGeometry(t.parkCode)[t.id] ?? [];
}

/** Hand-written featured trails (vs. the full NPS import). */
export const isFeatured = (t: Trail) => t.source !== "nps";
export const getFeaturedTrailsForPark = (code: string) => getTrailsForPark(code).filter(isFeatured);
/** Hiking trails = standard (terra) trails open to hikers. */
export const isHikingTrail = (t: Trail) => (t.trailType ?? "terra") === "terra" && (t.uses?.includes("hike") ?? t.activities.includes("hiking"));

/* ------------------------------ Visitation ------------------------------ */

interface Visitation { year: number; source: string; visits: Record<string, number> }
export const getVisitation = cache((): Visitation => {
  try { return JSON.parse(fs.readFileSync(path.join(CONTENT, "visitation.json"), "utf8")) as Visitation; }
  catch { return { year: 0, source: "", visits: {} }; }
});

/** Most visited first (parks without a figure go last, alphabetically). */
export function sortByVisits<T extends { code: string; name: string }>(parks: T[]): T[] {
  const v = getVisitation().visits;
  return [...parks].sort((a, b) => (v[b.code] ?? -1) - (v[a.code] ?? -1) || a.name.localeCompare(b.name));
}

/** 11527939 → "11.5M", 34479 → "34K" */
export function visitsLabel(code: string): string | null {
  const n = getVisitation().visits[code];
  if (!n) return null;
  return n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : `${Math.round(n / 1e3)}K`;
}
