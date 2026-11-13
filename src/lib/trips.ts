import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import type { ResolvedRef } from "./user-data";

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TripInput = z.object({
  name: z.string().trim().min(1).max(120),
  startDate: ISO.nullable().optional(),
  endDate: ISO.nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  isPublic: z.boolean().optional(),
}).refine((t) => !t.startDate || !t.endDate || t.endDate >= t.startDate, { message: "End date is before start date", path: ["endDate"] });

export const TripPatch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  startDate: ISO.nullable().optional(),
  endDate: ISO.nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  isPublic: z.boolean().optional(),
});

export const StopPatch = z.object({
  day: z.number().int().min(1).max(60).optional(),
  time: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  move: z.enum(["up", "down"]).optional(),
});

/** Number of days in a trip (1 if undated). */
export function tripDays(t: { startDate: string | null; endDate: string | null }) {
  if (!t.startDate || !t.endDate) return 1;
  return Math.min(60, Math.round((Date.parse(t.endDate) - Date.parse(t.startDate)) / 86400000) + 1);
}

/** The calendar date for day N of a trip, if the trip has dates. */
export function dayDate(t: { startDate: string | null }, day: number) {
  if (!t.startDate) return null;
  return new Date(Date.parse(t.startDate) + (day - 1) * 86400000).toISOString().slice(0, 10);
}

export async function listTrips(userId: string) {
  if (!db) return [];
  return db
    .select({
      id: schema.trips.id, name: schema.trips.name, startDate: schema.trips.startDate, endDate: schema.trips.endDate,
      isPublic: schema.trips.isPublic, stops: sql<number>`(select count(*)::int from trip_stops s where s.trip_id = ${schema.trips.id})`,
    })
    .from(schema.trips)
    .where(eq(schema.trips.userId, userId))
    .orderBy(sql`${schema.trips.startDate} desc nulls last`, asc(schema.trips.name));
}

export async function createTrip(userId: string, input: z.infer<typeof TripInput>) {
  const [trip] = await db!.insert(schema.trips).values({ ...input, userId }).returning();
  return trip;
}

/** Load a trip the viewer may see: their own, or a public one. */
export async function getTrip(id: string, viewerId: string | null) {
  if (!db || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [trip] = await db.select().from(schema.trips).where(eq(schema.trips.id, id)).limit(1);
  if (!trip || (trip.userId !== viewerId && !trip.isPublic)) return null;
  const stops = await db.select().from(schema.tripStops).where(eq(schema.tripStops.tripId, id)).orderBy(asc(schema.tripStops.day), asc(schema.tripStops.position));
  return { trip, stops, isOwner: trip.userId === viewerId };
}

async function ownedTrip(id: string, userId: string) {
  if (!db || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [trip] = await db.select().from(schema.trips).where(and(eq(schema.trips.id, id), eq(schema.trips.userId, userId))).limit(1);
  return trip ?? null;
}

export async function updateTrip(id: string, userId: string, patch: z.infer<typeof TripPatch>) {
  const trip = await ownedTrip(id, userId);
  if (!trip) return null;
  const [row] = await db!.update(schema.trips).set({ ...patch, updatedAt: new Date() }).where(eq(schema.trips.id, id)).returning();
  // If the trip got shorter, pull stops on removed days onto the last day.
  const days = tripDays(row);
  await db!.update(schema.tripStops).set({ day: days }).where(and(eq(schema.tripStops.tripId, id), sql`${schema.tripStops.day} > ${days}`));
  return row;
}

export async function deleteTrip(id: string, userId: string) {
  const trip = await ownedTrip(id, userId);
  if (!trip) return false;
  await db!.delete(schema.trips).where(eq(schema.trips.id, id));
  return true;
}

export async function addStop(tripId: string, userId: string, ref: ResolvedRef, opts: { day?: number; time?: string | null; notes?: string | null }) {
  const trip = await ownedTrip(tripId, userId);
  if (!trip) return null;
  const day = Math.min(Math.max(opts.day ?? 1, 1), tripDays(trip));
  const [{ max }] = await db!
    .select({ max: sql<number>`coalesce(max(${schema.tripStops.position}), -1)::int` })
    .from(schema.tripStops)
    .where(and(eq(schema.tripStops.tripId, tripId), eq(schema.tripStops.day, day)));
  const [stop] = await db!
    .insert(schema.tripStops)
    .values({ tripId, day, position: max + 1, kind: ref.kind, refId: ref.refId, parkCode: ref.parkCode, name: ref.name, lat: ref.lat, lon: ref.lon, time: opts.time ?? null, notes: opts.notes ?? null })
    .returning();
  await db!.update(schema.trips).set({ updatedAt: new Date() }).where(eq(schema.trips.id, tripId));
  return stop;
}

export async function updateStop(tripId: string, stopId: string, userId: string, patch: z.infer<typeof StopPatch>) {
  const trip = await ownedTrip(tripId, userId);
  if (!trip || !/^[0-9a-f-]{36}$/i.test(stopId)) return null;
  const [stop] = await db!.select().from(schema.tripStops).where(and(eq(schema.tripStops.id, stopId), eq(schema.tripStops.tripId, tripId))).limit(1);
  if (!stop) return null;

  if (patch.move) {
    // Swap with the neighbour in the same day.
    const sameDay = await db!.select().from(schema.tripStops).where(and(eq(schema.tripStops.tripId, tripId), eq(schema.tripStops.day, stop.day))).orderBy(asc(schema.tripStops.position));
    const i = sameDay.findIndex((s) => s.id === stop.id);
    const j = patch.move === "up" ? i - 1 : i + 1;
    if (j >= 0 && j < sameDay.length) {
      const other = sameDay[j];
      await db!.update(schema.tripStops).set({ position: other.position }).where(eq(schema.tripStops.id, stop.id));
      await db!.update(schema.tripStops).set({ position: stop.position }).where(eq(schema.tripStops.id, other.id));
    }
  }

  const set: Partial<typeof schema.tripStops.$inferInsert> = {};
  if (patch.time !== undefined) set.time = patch.time;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.day !== undefined && patch.day !== stop.day) {
    set.day = Math.min(patch.day, tripDays(trip));
    const [{ max }] = await db!.select({ max: sql<number>`coalesce(max(${schema.tripStops.position}), -1)::int` }).from(schema.tripStops).where(and(eq(schema.tripStops.tripId, tripId), eq(schema.tripStops.day, set.day)));
    set.position = max + 1; // move to the end of the new day
  }
  if (Object.keys(set).length) await db!.update(schema.tripStops).set(set).where(eq(schema.tripStops.id, stopId));
  return true;
}

export async function deleteStop(tripId: string, stopId: string, userId: string) {
  const trip = await ownedTrip(tripId, userId);
  if (!trip || !/^[0-9a-f-]{36}$/i.test(stopId)) return false;
  await db!.delete(schema.tripStops).where(and(eq(schema.tripStops.id, stopId), eq(schema.tripStops.tripId, tripId)));
  return true;
}
