import "server-only";
import { cache } from "react";
import { getActivities, getParks, getTrails, getVisitation, isHikingTrail, parkSearchText } from "./content";
import { getAllCampgrounds, campMeta } from "./campgrounds";
import { trailMeta } from "./trail-format";

export type SearchType = "park" | "activity" | "trail" | "campground";
export interface SearchHit { type: SearchType; id: string; title: string; subtitle: string; href: string; icon: string }
interface Entry extends SearchHit { title_n: string; text: string; boost: number }

export const SEARCH_TYPE_LABEL: Record<SearchType, string> = { park: "Parks", activity: "Activities", trail: "Trails", campground: "Campgrounds" };

/** Lower-case, strip accents and punctuation: "Hawaiʻi Volcanoes" → "hawaii volcanoes". */
export const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[ʻ'’`]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

const shortPark = (n: string) => n.replace(/ National Parks?( and Preserve)?$/, "").replace(/^National Park of /, "");

/** Built once per server instance from the flat files. */
const getIndex = cache((): Entry[] => {
  const parks = getParks();
  const parkName = new Map(parks.map((p) => [p.code, shortPark(p.name)]));
  const maxVisits = Math.max(1, ...Object.values(getVisitation().visits));
  const entries: Entry[] = [];
  const add = (e: Omit<Entry, "title_n" | "text"> & { extra?: string }) => {
    const { extra, ...rest } = e;
    entries.push({ ...rest, title_n: norm(e.title), text: norm(`${e.title} ${e.subtitle} ${extra ?? ""}`) });
  };

  for (const p of parks) {
    add({
      type: "park", id: p.code, title: shortPark(p.name), subtitle: `National park · ${p.states.join(", ")}`, href: `/parks/${p.code}`, icon: "🏞️",
      extra: `${parkSearchText(p)} ${p.code} ${p.tagline} ${(p.highlights ?? []).join(" ")} national park`,
      boost: 40 + 25 * Math.sqrt((getVisitation().visits[p.code] ?? 0) / maxVisits),
    });
  }
  for (const a of getActivities()) {
    add({ type: "activity", id: a.slug, title: a.name, subtitle: "Activity", href: `/activities/${a.slug}`, icon: a.icon, extra: `${a.description} ${(a.npsActivities ?? []).join(" ")}`, boost: 45 });
  }
  for (const t of getTrails()) {
    if (t.closed) continue;
    const park = parkName.get(t.parkCode) ?? t.parkCode;
    add({
      type: "trail", id: t.id, title: t.name, subtitle: `${park} · ${trailMeta(t)}`, href: `/trails/${t.id}`, icon: isHikingTrail(t) ? "🥾" : "〰️",
      extra: `${park} trail ${t.parkCode}`, boost: t.source === "nps" ? 10 : 18,
    });
  }
  for (const c of getAllCampgrounds()) {
    const park = parkName.get(c.parkCode) ?? c.parkCode;
    add({ type: "campground", id: c.id, title: c.name, subtitle: `${park} · ${campMeta(c)}`, href: `/campgrounds/${c.id}`, icon: "⛺", extra: `${park} camping campground camp`, boost: 15 });
  }
  return entries;
});

/**
 * Every word must match the start of a word in the entry ("yose upp" → Upper Pines in Yosemite).
 * Title matches, exact titles and popular parks rank higher.
 */
export function search(query: string, opts: { limit?: number; types?: SearchType[] } = {}): SearchHit[] {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(" ").filter(Boolean).slice(0, 8);
  const limit = opts.limit ?? 50;
  const scored: { e: Entry; score: number }[] = [];

  for (const e of getIndex()) {
    if (opts.types && !opts.types.includes(e.type)) continue;
    let score = e.boost;
    let ok = true;
    for (const w of words) {
      const inTitle = e.title_n === w || e.title_n.startsWith(`${w} `) || e.title_n.includes(` ${w}`) || e.title_n.startsWith(w);
      if (inTitle) score += 30;
      else if (` ${e.text}`.includes(` ${w}`)) score += 8;
      else { ok = false; break; }
    }
    if (!ok) continue;
    if (e.title_n === q) score += 80;
    else if (e.title_n.startsWith(q)) score += 40;
    scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.e.title.localeCompare(b.e.title));
  return scored.slice(0, limit).map(({ e }) => ({ type: e.type, id: e.id, title: e.title, subtitle: e.subtitle, href: e.href, icon: e.icon }));
}

/** Top few of each type, for the header dropdown. */
export function searchGrouped(query: string, perType = 4): { type: SearchType; hits: SearchHit[] }[] {
  const all = search(query, { limit: 400 });
  return (["park", "activity", "campground", "trail"] as SearchType[])
    .map((type) => ({ type, hits: all.filter((h) => h.type === type).slice(0, perType) }))
    .filter((g) => g.hits.length);
}
