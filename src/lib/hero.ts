import "server-only";
import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import type { Park } from "./types";

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

/** The park's own hero image, also accepting its 4-letter code as the file name (acad.jpg). */
export function parkHero(p: Pick<Park, "name" | "code">): HeroImage | null {
  return find("parks", parkSlug(p)) ?? find("parks", p.code);
}

/** Every park image, for the homepage's random hero. */
export function allParkHeroes(): HeroImage[] {
  return listDir("parks").map((f) => ({ src: `/images/parks/${f}`, credit: credits("parks")[f] }));
}

/** Activity image, else the image of the first park offering it that has one. */
export function activityHero(slug: string, parks: Pick<Park, "name" | "code">[]): HeroImage | null {
  return find("activities", slug) ?? parks.map(parkHero).find(Boolean) ?? null;
}
