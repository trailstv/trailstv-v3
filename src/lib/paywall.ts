import "server-only";
import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { NextResponse } from "next/server";
import { getUser, type SessionUser } from "./auth";
import { getUserEntitlements } from "./billing";
import { db } from "./db";

/**
 * What needs TrailsTV+ (content/paywall.json). TrailsTV+ = an active or trialing Stripe
 * subscription, or a complimentary grant from Admin. Admins always have full access.
 * Nothing is deleted when a membership ends: saved items and trips come back on renewal.
 */
export type PaidFeature = "trips" | "saving" | "activities";

export const FEATURE_COPY: Record<PaidFeature, { title: string; text: string }> = {
  trips: { title: "Plan trips with TrailsTV+", text: "Build day-by-day itineraries, add parks, trails and campgrounds, and send each day to your maps app or calendar." },
  saving: { title: "Save your parks with TrailsTV+", text: "Favorite and save parks, trails and campgrounds, and keep a log of everywhere you've been." },
  activities: { title: "Explore every activity with TrailsTV+", text: "See every park and route for this activity on one map, with live conditions for each." },
};

const readConfig = cache((): Record<PaidFeature, boolean> => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "content", "paywall.json"), "utf8"));
    return { trips: raw.trips !== false, saving: raw.saving !== false, activities: raw.activities !== false };
  } catch {
    return { trips: true, saving: true, activities: true };
  }
});

export const isPaid = (f: PaidFeature) => readConfig()[f];

export interface Access { user: SessionUser | null; plus: boolean; admin: boolean }

/** Who is viewing and whether they have TrailsTV+ (cached per request). */
export const getAccess = cache(async (): Promise<Access> => {
  const user = await getUser().catch(() => null);
  if (!user) return { user: null, plus: false, admin: false };
  const admin = user.role === "admin";
  if (admin) return { user, plus: true, admin };
  const ent = await getUserEntitlements(user.id).catch(() => null);
  return { user, plus: Boolean(ent?.plus), admin };
});

/** Can the current viewer use this feature? */
export async function canUse(f: PaidFeature): Promise<boolean> {
  if (!isPaid(f)) return true;
  return (await getAccess()).plus;
}

/**
 * For API routes: the signed-in user if they may use the feature, otherwise a JSON error
 * (401 sign in / 402 TrailsTV+ required) the client turns into an upgrade prompt.
 */
export async function requireFeature(f: PaidFeature): Promise<SessionUser | NextResponse> {
  if (!db) return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  const a = await getAccess();
  if (!a.user) return NextResponse.json({ error: "Sign in required", login: "/login" }, { status: 401 });
  if (isPaid(f) && !a.plus) {
    return NextResponse.json({ error: "TrailsTV+ required", upgrade: "/pricing", feature: f }, { status: 402 });
  }
  return a.user;
}
