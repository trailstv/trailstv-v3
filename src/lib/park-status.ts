import "server-only";
import type { Park } from "./types";
import { getParks, sortByVisits } from "./content";
import { distanceKm } from "./geo";
import { fetchSource, missingKey } from "./sources/http";
import { getWeatherAlerts } from "./sources/nws";
import { getSnowNear } from "./sources/snotel";
import { getAirQuality } from "./sources/misc";

/**
 * "Current conditions across every park" — one report per type, used by the
 * home page pills and /conditions. National feeds are fetched once (NPS alerts,
 * wildfire perimeters, avalanche map); point feeds are fetched per park and cached.
 */

export const STATUS_TYPES = {
  closures: { label: "Closures", icon: "⛔", blurb: "Roads, trails, campgrounds and areas closed by the park." },
  alerts: { label: "Park alerts", icon: "⚠️", blurb: "Danger and caution notices posted by each park." },
  fire: { label: "Wildfires", icon: "🔥", blurb: "Active wildfire perimeters in or near a park." },
  weather: { label: "Weather warnings", icon: "🌩️", blurb: "National Weather Service warnings, watches and advisories." },
  snow: { label: "Snow", icon: "❄️", blurb: "Snow on the ground at the nearest SNOTEL station." },
  avalanche: { label: "Avalanche", icon: "🏔️", blurb: "Today's avalanche danger from regional avalanche centers." },
  air: { label: "Air quality", icon: "💨", blurb: "Air quality index, including wildfire smoke." },
} as const;
export type StatusType = keyof typeof STATUS_TYPES;
export const isStatusType = (s: string): s is StatusType => s in STATUS_TYPES;

export type Level = "high" | "medium" | "low";
export interface StatusItem { title: string; detail?: string; date?: string }
export interface ParkStatus {
  code: string; name: string; states: string[]; lat: number; lon: number;
  level: Level;
  headline: string;
  items: StatusItem[];
}
export interface StatusReport {
  type: StatusType;
  ok: boolean;
  error?: string;
  attribution: string;
  fetchedAt: string;
  /** How many parks were checked (e.g. snow only checks parks with snow stations). */
  checked: number;
  parks: ParkStatus[];
}

const shortName = (n: string) => n.replace(/ National Parks?( and Preserve)?$/, "").replace(/^National Park of /, "");
const base = (p: Park) => ({ code: p.code, name: shortName(p.name), states: p.states, lat: p.lat, lon: p.lon });
const LEVEL_RANK: Record<Level, number> = { high: 0, medium: 1, low: 2 };
const order = (parks: ParkStatus[]) => {
  const rank = new Map(sortByVisits(getParks()).map((p, i) => [p.code, i]));
  return parks.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || (rank.get(a.code) ?? 999) - (rank.get(b.code) ?? 999));
};
const clip = (s: string, n = 260) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, "")}…` : t; };

/** Run per-park requests a few at a time so we never flood an upstream API. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const n = i++; out[n] = await fn(items[n]); }
  }));
  return out;
}

/* ----------------------------- NPS alerts (closures + alerts) ----------------------------- */

interface NpsAlertRaw { id: string; parkCode: string; title: string; description: string; category: string; lastIndexedDate: string }

async function npsAlerts() {
  const ATTR = "National Park Service (nps.gov)";
  if (!process.env.NPS_API_KEY) return missingKey<NpsAlertRaw[]>("nps-alerts", ATTR, "NPS_API_KEY");
  const codes = getParks().map((p) => p.code).join(",");
  const q = new URLSearchParams({ parkCode: codes, limit: "1000", api_key: process.env.NPS_API_KEY });
  return fetchSource<{ data: NpsAlertRaw[] }, NpsAlertRaw[]>("nps-alerts-all", ATTR, `https://developer.nps.gov/api/v1/alerts?${q}`, { revalidate: 900, timeoutMs: 15000 }, (r) => r.data ?? []);
}

async function alertReport(type: "closures" | "alerts"): Promise<StatusReport> {
  const r = await npsAlerts();
  const parks = getParks();
  const want = type === "closures" ? (c: string) => /closure/i.test(c) : (c: string) => /danger|caution/i.test(c);
  const byPark = new Map<string, NpsAlertRaw[]>();
  for (const a of r.data ?? []) {
    if (!want(a.category)) continue;
    for (const code of String(a.parkCode).split(",")) {
      if (!byPark.has(code)) byPark.set(code, []);
      byPark.get(code)!.push(a);
    }
  }
  const out: ParkStatus[] = [];
  for (const p of parks) {
    const list = byPark.get(p.code);
    if (!list?.length) continue;
    const danger = list.some((a) => /danger/i.test(a.category));
    out.push({
      ...base(p),
      level: type === "closures" ? "medium" : danger ? "high" : "medium",
      headline: list.length === 1 ? list[0].title : `${list.length} ${type === "closures" ? "closures" : "alerts"}: ${list[0].title}`,
      items: list.map((a) => ({ title: `${type === "alerts" ? `${a.category}: ` : ""}${a.title}`, detail: clip(a.description), date: a.lastIndexedDate?.slice(0, 10) })),
    });
  }
  return { type, ok: r.ok, error: r.error, attribution: r.attribution, fetchedAt: r.fetchedAt, checked: parks.length, parks: order(out) };
}

/* ----------------------------------- Wildfires ----------------------------------- */

async function fireReport(): Promise<StatusReport> {
  const ATTR = "National Interagency Fire Center (WFIGS)";
  const q = new URLSearchParams({
    where: "1=1", outFields: "poly_IncidentName,attr_IncidentName,poly_GISAcres,attr_IncidentSize,attr_PercentContained,attr_FireDiscoveryDateTime,attr_InitialLatitude,attr_InitialLongitude",
    returnGeometry: "false", returnCentroid: "true", outSR: "4326", f: "json",
  });
  type Raw = { features?: { attributes: Record<string, unknown>; centroid?: { x: number; y: number } }[] };
  const r = await fetchSource<Raw, Raw["features"]>("nifc-fires-all", ATTR,
    `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?${q}`,
    { revalidate: 1800, timeoutMs: 15000 }, (x) => x.features ?? []);
  const fires = (r.data ?? []).map(({ attributes: a, centroid }) => ({
    name: String(a.poly_IncidentName ?? a.attr_IncidentName ?? "Unnamed fire"),
    acres: Number(a.poly_GISAcres ?? a.attr_IncidentSize ?? 0) || null,
    containment: a.attr_PercentContained == null ? null : Number(a.attr_PercentContained),
    discovered: a.attr_FireDiscoveryDateTime ? new Date(a.attr_FireDiscoveryDateTime as number).toISOString().slice(0, 10) : undefined,
    lat: centroid?.y ?? Number(a.attr_InitialLatitude), lon: centroid?.x ?? Number(a.attr_InitialLongitude),
  })).filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon));

  const parks = getParks();
  const out: ParkStatus[] = [];
  for (const p of parks) {
    const near = fires
      .map((f) => ({ ...f, km: distanceKm(p.lat, p.lon, f.lat, f.lon) }))
      .filter((f) => f.km <= p.radiusKm + 25)
      .sort((a, b) => (b.acres ?? 0) - (a.acres ?? 0));
    if (!near.length) continue;
    const big = near.some((f) => (f.acres ?? 0) >= 1000 && (f.containment ?? 0) < 100);
    out.push({
      ...base(p),
      level: big ? "high" : "medium",
      headline: near.length === 1 ? fireName(near[0].name) : `${near.length} fires nearby`,
      items: near.map((f) => ({
        title: fireName(f.name),
        detail: [f.acres ? `${Math.round(f.acres).toLocaleString()} acres` : null, f.containment != null ? `${f.containment}% contained` : null, `${Math.round(f.km * 0.621)} mi from park center`].filter(Boolean).join(" · "),
        date: f.discovered,
      })),
    });
  }
  return { type: "fire", ok: r.ok, error: r.error, attribution: ATTR, fetchedAt: r.fetchedAt, checked: parks.length, parks: order(out) };
}

/* -------------------------------- Weather warnings -------------------------------- */

async function weatherReport(): Promise<StatusReport> {
  // NWS covers US states and territories; American Samoa is included via its own office.
  const parks = getParks();
  const results = await mapLimit(parks, 8, (p) => getWeatherAlerts(p.lat, p.lon));
  const out: ParkStatus[] = [];
  parks.forEach((p, i) => {
    const list = results[i].data ?? [];
    if (!list.length) return;
    const sev = list.some((a) => /extreme|severe/i.test(a.severity)) ? "high" : list.some((a) => /warning/i.test(a.event)) ? "high" : list.some((a) => /watch/i.test(a.event)) ? "medium" : "low";
    out.push({
      ...base(p), level: sev,
      headline: [...new Set(list.map((a) => a.event))].join(", "),
      items: list.map((a) => ({ title: a.event, detail: clip(a.headline || a.description), date: a.expires ? `until ${new Date(a.expires).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC` : undefined })),
    });
  });
  const ok = results.some((r) => r.ok);
  return { type: "weather", ok, error: ok ? undefined : results[0]?.error, attribution: "National Weather Service (weather.gov)", fetchedAt: new Date().toISOString(), checked: parks.length, parks: order(out) };
}

/* -------------------------------------- Snow -------------------------------------- */

const SNOTEL_STATES = new Set(["AK", "AZ", "CA", "CO", "ID", "MT", "NM", "NV", "OR", "SD", "UT", "WA", "WY"]);

async function snowReport(): Promise<StatusReport> {
  const parks = getParks().filter((p) => p.states.some((s) => SNOTEL_STATES.has(s)));
  const results = await mapLimit(parks, 6, (p) => getSnowNear(p.lat, p.lon, p.states.filter((s) => SNOTEL_STATES.has(s)), p.radiusKm));
  const out: ParkStatus[] = [];
  parks.forEach((p, i) => {
    const st = (results[i].data ?? []).filter((s) => (s.snowDepthIn ?? 0) > 0).sort((a, b) => (b.snowDepthIn ?? 0) - (a.snowDepthIn ?? 0));
    if (!st.length) return;
    const deepest = st[0].snowDepthIn ?? 0;
    out.push({
      ...base(p), level: deepest >= 24 ? "high" : deepest >= 6 ? "medium" : "low",
      headline: `${deepest}" of snow at ${titleCase(st[0].name)} (${st[0].elevationFt.toLocaleString()} ft)`,
      items: st.map((s) => ({ title: `${titleCase(s.name)} · ${s.elevationFt.toLocaleString()} ft`, detail: [`${s.snowDepthIn}" snow depth`, s.sweIn != null ? `${s.sweIn}" water equivalent` : null, s.airTempF != null ? `${s.airTempF}°F` : null].filter(Boolean).join(" · "), date: s.date ?? undefined })),
    });
  });
  out.sort((a, b) => num(b.headline) - num(a.headline));
  const ok = results.some((r) => r.ok);
  return { type: "snow", ok, error: ok ? undefined : results[0]?.error, attribution: "USDA NRCS SNOTEL", fetchedAt: new Date().toISOString(), checked: parks.length, parks: out };
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fireName = (s: string) => (/\bfire$/i.test(s.trim()) ? s.trim() : `${s.trim()} Fire`);
const num = (s: string) => Number(s.match(/^(\d+)/)?.[1] ?? 0);
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/* ------------------------------------ Avalanche ------------------------------------ */

async function avalancheReport(): Promise<StatusReport> {
  const ATTR = "avalanche.org / regional avalanche centers";
  type Raw = { features: { properties: { name: string; center: string; center_id: string; danger: string; danger_level: number; travel_advice: string; off_season: boolean } }[] };
  const r = await fetchSource<Raw, Raw["features"]>("avalanche", ATTR, "https://api.avalanche.org/v2/public/products/map-layer", { revalidate: 1800 }, (x) => x.features);
  const parks = getParks().filter((p) => p.avalancheCenter);
  const out: ParkStatus[] = [];
  for (const p of parks) {
    const zones = (r.data ?? []).map((f) => f.properties).filter((z) => z.center_id === p.avalancheCenter && !z.off_season && z.danger_level > 0);
    if (!zones.length) continue;
    const top = zones.reduce((a, b) => (b.danger_level > a.danger_level ? b : a));
    out.push({
      ...base(p), level: top.danger_level >= 3 ? "high" : top.danger_level === 2 ? "medium" : "low",
      headline: `${cap(top.danger)} danger · ${top.center}`,
      items: zones.sort((a, b) => b.danger_level - a.danger_level).map((z) => ({ title: `${z.name}: ${cap(z.danger)}`, detail: z.travel_advice ? clip(z.travel_advice) : undefined })),
    });
  }
  return { type: "avalanche", ok: r.ok, error: r.error, attribution: ATTR, fetchedAt: r.fetchedAt, checked: parks.length, parks: order(out) };
}

/* ------------------------------------ Air quality ------------------------------------ */

async function airReport(): Promise<StatusReport> {
  const parks = getParks().filter((p) => !["AS", "VI"].includes(p.states[0]));
  const results = await mapLimit(parks, 6, (p) => getAirQuality(p.lat, p.lon));
  const out: ParkStatus[] = [];
  parks.forEach((p, i) => {
    const list = results[i].data ?? [];
    if (!list.length) return;
    const worst = list.reduce((a, b) => (b.aqi > a.aqi ? b : a));
    if (worst.aqi <= 50) return; // "Good" isn't news
    out.push({
      ...base(p), level: worst.aqi > 150 ? "high" : worst.aqi > 100 ? "medium" : "low",
      headline: `AQI ${worst.aqi} · ${worst.category} (${worst.parameter})`,
      items: list.map((a) => ({ title: `${a.parameter}: AQI ${a.aqi}`, detail: `${a.category} · ${a.reportingArea}`, date: a.observedAt })),
    });
  });
  out.sort((a, b) => Number(b.headline.match(/AQI (\d+)/)?.[1] ?? 0) - Number(a.headline.match(/AQI (\d+)/)?.[1] ?? 0));
  const ok = results.some((r) => r.ok);
  return { type: "air", ok, error: ok ? undefined : results[0]?.error, attribution: "U.S. EPA AirNow", fetchedAt: new Date().toISOString(), checked: parks.length, parks: out };
}

/* ------------------------------------------------------------------------------------ */

/** Never throws: a broken upstream response shows "unavailable" instead of breaking the page. */
export async function getStatusReport(type: StatusType): Promise<StatusReport> {
  try {
    return await buildReport(type);
  } catch (e) {
    return { type, ok: false, error: (e as Error).message, attribution: "", fetchedAt: new Date().toISOString(), checked: 0, parks: [] };
  }
}

function buildReport(type: StatusType): Promise<StatusReport> {
  switch (type) {
    case "closures": return alertReport("closures");
    case "alerts": return alertReport("alerts");
    case "fire": return fireReport();
    case "weather": return weatherReport();
    case "snow": return snowReport();
    case "avalanche": return avalancheReport();
    case "air": return airReport();
  }
}

export async function getAllStatusReports(): Promise<StatusReport[]> {
  return Promise.all((Object.keys(STATUS_TYPES) as StatusType[]).map(getStatusReport));
}
