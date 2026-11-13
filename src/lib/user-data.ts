import "server-only";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import { getPark, getParks, getTrail } from "./content";
import { getCampground } from "./campgrounds";

/* ------------------------------ Ref resolution ------------------------------ */

export const RefInput = z.object({
  kind: z.enum(["park", "trail", "campground", "custom"]),
  refId: z.string().min(1).max(120).optional(),
  // Snapshot used only for things not in our flat files (campgrounds from the NPS API, custom stops).
  parkCode: z.string().max(4).optional(),
  name: z.string().trim().min(1).max(140).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
});
export type RefInput = z.infer<typeof RefInput>;

export interface ResolvedRef { kind: RefInput["kind"]; refId: string | null; parkCode: string | null; name: string; lat: number | null; lon: number | null }

/** Parks and trails are looked up in the flat files, so clients can't inject fake names or coordinates. */
export function resolveRef(r: RefInput): ResolvedRef | null {
  if (r.kind === "park") {
    const p = r.refId ? getPark(r.refId) : undefined;
    return p ? { kind: "park", refId: p.code, parkCode: p.code, name: p.name, lat: p.lat, lon: p.lon } : null;
  }
  if (r.kind === "trail") {
    const t = r.refId ? getTrail(r.refId) : undefined;
    return t ? { kind: "trail", refId: t.id, parkCode: t.parkCode, name: t.name, lat: t.trailhead.lat, lon: t.trailhead.lon } : null;
  }
  if (r.kind === "campground" && r.refId && getCampground(r.refId)) {
    const c = getCampground(r.refId)!;
    const p = getPark(c.parkCode)!;
    return { kind: "campground", refId: c.id, parkCode: c.parkCode, name: c.name, lat: c.lat ?? p.lat, lon: c.lon ?? p.lon };
  }
  if (!r.name) return null;
  if (r.parkCode && !getPark(r.parkCode)) return null;
  return { kind: r.kind, refId: r.refId ?? null, parkCode: r.parkCode ?? null, name: r.name, lat: r.lat ?? null, lon: r.lon ?? null };
}

/* --------------------------- Favorites & saves --------------------------- */

export async function setFlag(userId: string, ref: ResolvedRef, field: "favorite" | "saved", value: boolean) {
  if (!db || ref.kind === "custom" || !ref.refId || !ref.parkCode) throw new Error("Can't save this item");
  const base = { userId, kind: ref.kind, refId: ref.refId, parkCode: ref.parkCode, name: ref.name, lat: ref.lat, lon: ref.lon };
  await db
    .insert(schema.userItems)
    .values({ ...base, [field]: value })
    .onConflictDoUpdate({
      target: [schema.userItems.userId, schema.userItems.kind, schema.userItems.refId],
      set: { [field]: value, name: ref.name, updatedAt: new Date() },
    });
}

export interface ItemState { favorite: boolean; saved: boolean; completions: { id: string; completedOn: string }[]; visitedViaTrail?: string }

/** State of several items at once, for the action buttons on a page. */
export async function getItemStates(userId: string, refs: { kind: string; refId: string }[]) {
  if (!db || !refs.length) return {};
  const ids = refs.map((r) => r.refId);
  const [items, done] = await Promise.all([
    db.select().from(schema.userItems).where(and(eq(schema.userItems.userId, userId), inArray(schema.userItems.refId, ids))),
    db.select().from(schema.completions).where(and(eq(schema.completions.userId, userId), inArray(schema.completions.refId, ids))).orderBy(desc(schema.completions.completedOn)),
  ]);
  const out: Record<string, ItemState> = {};
  for (const r of refs) {
    const key = `${r.kind}:${r.refId}`;
    const item = items.find((i) => i.kind === r.kind && i.refId === r.refId);
    out[key] = {
      favorite: item?.favorite ?? false,
      saved: item?.saved ?? false,
      completions: done.filter((c) => c.kind === r.kind && c.refId === r.refId).map((c) => ({ id: c.id, completedOn: c.completedOn })),
    };
  }
  // A park counts as visited if any of its trails is completed.
  for (const r of refs.filter((r) => r.kind === "park")) {
    const viaTrail = await db
      .select({ id: schema.completions.id, completedOn: schema.completions.completedOn })
      .from(schema.completions)
      .where(and(eq(schema.completions.userId, userId), inArray(schema.completions.kind, ["trail", "campground"]), eq(schema.completions.parkCode, r.refId)))
      .limit(1);
    const s = out[`park:${r.refId}`];
    if (s && viaTrail.length) s.visitedViaTrail = viaTrail[0].completedOn;
  }
  return out;
}

/* ----------------------------- Visited / completed ----------------------------- */

export const CompletionInput = z.object({
  kind: z.enum(["park", "trail", "campground"]),
  refId: z.string().min(1).max(120),
  completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  activity: z.string().max(40).optional(),
  notes: z.string().max(2000).optional(),
});

export async function addCompletion(userId: string, input: z.infer<typeof CompletionInput>) {
  if (!db) throw new Error("DATABASE_URL not configured");
  const ref = resolveRef({ kind: input.kind, refId: input.refId });
  if (!ref?.parkCode || !ref.refId) throw new Error("Unknown park, trail or campground");
  const [row] = await db
    .insert(schema.completions)
    .values({ userId, kind: input.kind, refId: ref.refId!, parkCode: ref.parkCode, completedOn: input.completedOn, activity: input.activity, notes: input.notes })
    .returning();
  return row;
}

export async function deleteCompletion(userId: string, id: string) {
  if (!db) return;
  await db.delete(schema.completions).where(and(eq(schema.completions.id, id), eq(schema.completions.userId, userId)));
}

/* --------------------------------- Dashboard --------------------------------- */

export async function getDashboard(userId: string) {
  if (!db) return null;
  const [items, done, trips] = await Promise.all([
    db.select().from(schema.userItems).where(and(eq(schema.userItems.userId, userId), or(eq(schema.userItems.favorite, true), eq(schema.userItems.saved, true)))).orderBy(desc(schema.userItems.updatedAt)),
    db.select().from(schema.completions).where(eq(schema.completions.userId, userId)).orderBy(desc(schema.completions.completedOn)),
    db.select().from(schema.trips).where(eq(schema.trips.userId, userId)).orderBy(desc(schema.trips.startDate)),
  ]);

  const visitedParks = new Map<string, string>(); // parkCode → first visit date
  for (const c of [...done].reverse()) if (!visitedParks.has(c.parkCode)) visitedParks.set(c.parkCode, c.completedOn);

  const completedTrailIds = [...new Set(done.filter((c) => c.kind === "trail").map((c) => c.refId))];
  const trails = completedTrailIds.map((id) => getTrail(id)).filter((t) => !!t);
  const trailLogs = done.filter((c) => c.kind === "trail");

  return {
    favorites: items.filter((i) => i.favorite),
    saved: items.filter((i) => i.saved),
    completions: done,
    visitedParks: [...visitedParks.entries()].map(([code, date]) => ({ park: getPark(code)!, firstVisit: date })).filter((v) => v.park),
    trips,
    stats: {
      parksVisited: visitedParks.size,
      parksTotal: getParks().length,
      trailsCompleted: completedTrailIds.length,
      // Totals count every logged completion (hiking a trail twice counts twice).
      miles: Math.round(trailLogs.reduce((sum, c) => sum + (getTrail(c.refId)?.distanceMi ?? 0), 0) * 10) / 10,
      elevationFt: trailLogs.reduce((sum, c) => sum + (getTrail(c.refId)?.gainFt ?? 0), 0),
      uniqueTrails: trails.length,
    },
  };
}
