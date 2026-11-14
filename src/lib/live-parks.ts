import "server-only";
import { cache } from "react";
import type { Park } from "./types";
import { getActivities, getParks } from "./content";
import { fetchSource } from "./sources/http";

/**
 * Parks whose activity list hasn't been imported yet (`npm run sync:nps`) get it live from the
 * NPS API: one request for all of them, cached for a day. Imported parks are used as-is.
 * Needs NPS_API_KEY; without it those parks simply show no activities.
 */
export const getParksWithActivities = cache(async (): Promise<Park[]> => {
  const parks = getParks();
  const missing = parks.filter((p) => !p.activities.length);
  const key = process.env.NPS_API_KEY;
  if (!missing.length || !key) return parks;

  const q = new URLSearchParams({ parkCode: missing.map((p) => p.code).join(","), limit: "100", fields: "activities", api_key: key });
  type Raw = { data: { parkCode: string; activities: { name: string }[] }[] };
  const r = await fetchSource<Raw, Raw["data"]>("nps-park-activities", "National Park Service", `https://developer.nps.gov/api/v1/parks?${q}`, { revalidate: 86400, timeoutMs: 15000 }, (x) => x.data ?? []);
  if (!r.ok || !r.data) return parks;

  const acts = getActivities();
  const byCode = new Map(r.data.map((d) => {
    const names = new Set(d.activities.map((a) => a.name));
    return [d.parkCode, acts.filter((a) => (a.npsActivities ?? []).some((n) => names.has(n))).map((a) => a.slug)];
  }));
  return parks.map((p) => (p.activities.length ? p : { ...p, activities: byCode.get(p.code) ?? [] }));
});

export async function getParkWithActivities(code: string): Promise<Park | undefined> {
  return (await getParksWithActivities()).find((p) => p.code === code);
}

export async function getParksForActivityLive(slug: string): Promise<Park[]> {
  return (await getParksWithActivities()).filter((p) => p.activities.includes(slug));
}
