import "server-only";
import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import type { Park } from "./types";
import { getParks } from "./content";

/**
 * Hero images live in /public/images:
 *   parks/<park-slug>.jpg       e.g. acadia.jpg, grand-canyon.jpg, great-smoky-mountains.jpg
 *   activities/<activity>.jpg   e.g. hiking.jpg, kayaking.jpg (optional)
 * .jpg, .jpeg, .webp, .png and .avif all work. Optional photo credits:
 *   parks/credits.json  { "acadia.jpg": "Photo: NPS / Kristi Rugg" }
 */

const PUBLIC = path.join(process.cwd(), "public");
const EXTS = [".jpg", ".jpeg", ".webp", ".avif", ".png"];

export interface HeroImage { src: string; credit?: string }

/** "Great Smoky Mountains National Park" → "great-smoky-mountains"; "Hawaiʻi Volcanoes" → "hawaii-volcanoes". */
export function parkSlug(p: Pick<Park, "name">) {
  return p.name
    .replace(/^National Park of (the )?/i, "")
    .replace(/ National (and State )?Parks?( and Preserve)?$/i, "")
    .normalize("NFKD").replace(/[̀-ͯʻʼ']/g, "")
    .replace(/&/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const listDir = cache((dir: string): string[] => {
  const full = path.join(PUBLIC, "images", dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter((f) => EXTS.includes(path.extname(f).toLowerCase())).sort();
});

const credits = cache((dir: string): Record<string, string> => {
  const f = path.join(PUBLIC, "images", dir, "credits.json");
  try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {}; } catch { return {}; }
});

function find(dir: string, base: string): HeroImage | null {
  const file = listDir(dir).find((f) => path.parse(f).name.toLowerCase() === base);
  return file ? { src: `/images/${dir}/${file}`, credit: credits(dir)[file] } : null;
}

/* ------------------------------ NPS photos (live) ------------------------------ */

interface NpsImg { url: string; credit: string; altText: string; caption: string }
/** Public domain only: skip © / "courtesy of" / "all rights reserved" credits. */
const usable = (i: NpsImg) => /^https:\/\//.test(i.url) && !/©|\(c\)|copyright|all rights reserved|courtesy/i.test(`${i.credit} ${i.caption}`);
const creditLine = (c: string) => { const t = (c || "NPS").replace(/\s+/g, " ").trim(); return /^photo/i.test(t) ? t : `Photo: ${t}`; };

/**
 * For parks without a photo of yours in public/images/parks, use the park's own photo from the
 * NPS API (public domain, photographer credited). One request for all parks, cached for a day.
 * Needs NPS_API_KEY; without it those parks show the plain gradient header.
 */
const npsPhotos = cache(async (codeList: string): Promise<Map<string, HeroImage>> => {
  const codes = codeList ? codeList.split(",") : [];
  const key = process.env.NPS_API_KEY;
  const out = new Map<string, HeroImage>();
  if (!key || !codes.length) return out;
  try {
    const q = new URLSearchParams({ parkCode: codes.join(","), limit: "100", fields: "images", api_key: key });
    const r = await fetch(`https://developer.nps.gov/api/v1/parks?${q}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return out;
    const j = (await r.json()) as { data?: { parkCode: string; images?: NpsImg[] }[] };
    for (const d of j.data ?? []) {
      const img = (d.images ?? []).find(usable);
      if (img) out.set(d.parkCode, { src: img.url, credit: creditLine(img.credit) });
    }
  } catch { /* fall back to the gradient */ }
  return out;
});

/** Hero photo for every park: your own file first, else the NPS photo. */
export const getParkHeroes = cache(async (): Promise<Map<string, HeroImage>> => {
  const parks = getParks();
  const mine = new Map(parks.flatMap((p) => { const h = find("parks", parkSlug(p)) ?? find("parks", p.code); return h ? [[p.code, h] as const] : []; }));
  const nps = await npsPhotos(parks.filter((p) => !mine.has(p.code)).map((p) => p.code).sort().join(","));
  return new Map(parks.flatMap((p) => { const h = mine.get(p.code) ?? nps.get(p.code); return h ? [[p.code, h] as const] : []; }));
});

/** The park's hero image (yours, else the NPS photo). */
export async function parkHero(p: Pick<Park, "code">): Promise<HeroImage | null> {
  return (await getParkHeroes()).get(p.code) ?? null;
}

/** Every park image, for the random headers. */
export async function allParkHeroes(): Promise<HeroImage[]> {
  return [...(await getParkHeroes()).values()];
}

/** Activity image, else the image of the first park offering it that has one. */
export async function activityHero(slug: string, parks: Pick<Park, "code">[]): Promise<HeroImage | null> {
  const own = find("activities", slug);
  if (own) return own;
  const all = await getParkHeroes();
  return parks.map((p) => all.get(p.code)).find(Boolean) ?? null;
}
