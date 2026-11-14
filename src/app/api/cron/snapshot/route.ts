import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getParks } from "@/lib/content";
import { getConditions } from "@/lib/conditions";
import type { ConditionKey } from "@/lib/types";

export const maxDuration = 300;

/**
 * Vercel Cron (see vercel.json) – stores river, snow and fire conditions for
 * every park in Neon so you can show trends ("flow is rising") and fall back
 * to the last good reading when an upstream API is down.
 */
export async function GET(req: Request) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });

  const keys: ConditionKey[] = ["rivers", "snow", "fire"];
  let written = 0;
  for (const park of getParks()) {
    const results = await getConditions(park, keys);
    const rows = Object.entries(results)
      .filter(([, r]) => r.ok)
      .map(([source, r]) => ({ parkCode: park.code, source, payload: r.data as object }));
    if (rows.length) {
      await db.insert(schema.conditionSnapshots).values(rows);
      written += rows.length;
    }
  }
  return NextResponse.json({ written });
}
