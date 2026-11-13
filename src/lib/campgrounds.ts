import "server-only";
import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import type { Campground, Campsite } from "./campground-types";
import { getParks } from "./content";

export type { Campground, Campsite } from "./campground-types";

const DIR = path.join(process.cwd(), "content", "campgrounds");
const SITE_DIR = path.join(process.cwd(), "content", "campsites");

const readJson = <T,>(file: string, fallback: T): T => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; } catch { return fallback; }
};

export const getCampgroundsForPark = cache((parkCode: string): Campground[] =>
  /^[a-z]{4}$/.test(parkCode) ? readJson<Campground[]>(path.join(DIR, `${parkCode}.json`), []) : []);

export const getAllCampgrounds = cache((): Campground[] => getParks().flatMap((p) => getCampgroundsForPark(p.code)));

export function getCampground(id: string): Campground | undefined {
  const code = id.split("-")[0];
  return getCampgroundsForPark(code).find((c) => c.id === id);
}

export const getCampsites = cache((id: string): Campsite[] =>
  /^[a-z0-9-]+$/.test(id) ? readJson<Campsite[]>(path.join(SITE_DIR, `${id}.json`), []) : []);

/* ------------------------------ display helpers ------------------------------ */

export const shortCampName = (name: string) => name.replace(/\s+Campground$/i, "");

/** "Yes - seasonal" → { yes: true, note: "seasonal" }; "No"/"None"/"" → yes: false. */
export function amenity(v: string | string[]): { yes: boolean; note: string } | null {
  const s = (Array.isArray(v) ? v.join(", ") : v).trim();
  if (!s) return null;
  if (/^(no|none)\b/i.test(s)) return { yes: false, note: "" };
  const m = s.match(/^yes\s*[-–]\s*(.+)$/i);
  if (m) return { yes: true, note: m[1] };
  return { yes: true, note: /^yes$/i.test(s) ? "" : s };
}

export function priceRange(c: Campground): string | null {
  const costs = c.fees.map((f) => f.cost).filter((n): n is number => n != null && n > 0);
  if (!costs.length) return c.fees.length && c.fees.every((f) => f.cost === 0) ? "Free" : null;
  const lo = Math.min(...costs), hi = Math.max(...costs);
  const f = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
  return lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`;
}

/** "Reservations", "First come, first served", or both. */
export function bookingLabel(c: Campground): string {
  if (c.sitesReservable && c.sitesFirstCome) return "Reservable + first come";
  if (c.sitesReservable || (c.recGovId && !c.sitesFirstCome)) return "Reservations";
  if (c.sitesFirstCome) return "First come, first served";
  return c.reservationUrl ? "Reservations" : "Check availability on arrival";
}

/** One line for lists: "235 sites · $36 · Reservations · RVs to 35 ft" */
export function campMeta(c: Campground): string {
  return [
    c.sites.total ? `${c.sites.total} sites` : null,
    priceRange(c),
    bookingLabel(c),
    c.access.rvAllowed ? (c.access.rvMaxLength ? `RVs to ${c.access.rvMaxLength} ft` : "RVs OK") : c.access.rvAllowed === false ? "No RVs" : null,
  ].filter(Boolean).join(" · ");
}

/** Is the campground closed today according to its season exceptions? */
export function closedNow(c: Campground, today = new Date().toISOString().slice(0, 10)): string | null {
  for (const s of c.seasons) for (const e of s.exceptions) if (e.closed && e.start <= today && today <= e.end) return e.name || "Closed";
  return null;
}

/** Booking only: the single place visitors leave TrailsTV. */
export function reserveUrl(c: Campground): string | null {
  if (c.recGovId) return `https://www.recreation.gov/camping/campgrounds/${c.recGovId}`;
  return c.reservationUrl;
}
