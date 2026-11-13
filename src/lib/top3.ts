import "server-only";
import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { getActivities, getPark } from "./content";
import { parkHero } from "./hero";

/** One card in the home page "Top 3's" (safe to pass to the client). */
export interface TopPick { rank: number; code: string; href: string; name: string; states: string; why: string; image: string | null }
export interface TopGroup { slug: string; name: string; icon: string; picks: TopPick[] }

const short = (name: string) => name.replace(/ National Parks?( and Preserve)?$/, "").replace(/^National Park of /, "");

/**
 * Reads content/top3.json, in activities.json order. Unknown activities or park
 * codes fail the build with a clear message, so a typo never ships.
 */
export const getTopThrees = cache((): TopGroup[] => {
  const file = path.join(process.cwd(), "content", "top3.json");
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  const activities = getActivities();
  for (const key of Object.keys(raw)) {
    if (!key.startsWith("_") && !activities.some((a) => a.slug === key)) throw new Error(`content/top3.json: "${key}" is not an activity slug in activities.json`);
  }
  return activities.flatMap((a) => {
    const list = raw[a.slug] as { park: string; why: string }[] | undefined;
    if (!list?.length) return [];
    const picks = list.slice(0, 3).map((e, i) => {
      const p = getPark(e.park);
      if (!p) throw new Error(`content/top3.json: ${a.slug} #${i + 1} uses unknown park code "${e.park}"`);
      return { rank: i + 1, code: p.code, href: `/parks/${p.code}${p.activities.includes(a.slug) ? `?activity=${a.slug}` : ""}`, name: short(p.name), states: p.states.join(", "), why: e.why, image: parkHero(p)?.src ?? null };
    });
    return [{ slug: a.slug, name: a.name, icon: a.icon, picks }];
  });
});
