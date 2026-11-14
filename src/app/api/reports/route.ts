import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getPark, getActivity, getTrail } from "@/lib/content";
import { getUser } from "@/lib/auth";

const NewReport = z.object({
  parkCode: z.string().min(4).max(4),
  trailId: z.string().max(100).optional(),
  activity: z.string().max(40),
  rating: z.number().int().min(1).max(5),
  tripDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  conditionTags: z.array(z.string().max(30)).max(10).default([]),
  body: z.string().trim().min(10).max(5000),
});

/** GET /api/reports?park=zion&trail=zion-angels-landing */
export async function GET(req: Request) {
  if (!db) return NextResponse.json({ data: [], note: "DATABASE_URL not configured" });
  const sp = new URL(req.url).searchParams;
  const park = sp.get("park");
  const trail = sp.get("trail");
  const where = and(
    eq(schema.tripReports.hidden, false),
    park ? eq(schema.tripReports.parkCode, park) : undefined,
    trail ? eq(schema.tripReports.trailId, trail) : undefined,
  );
  const data = await db.select().from(schema.tripReports).where(where).orderBy(desc(schema.tripReports.createdAt)).limit(50);
  return NextResponse.json({ data });
}

/** POST /api/reports – create a trip report (signed-in users only). */
export async function POST(req: Request) {
  if (!db) return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to post a report" }, { status: 401 });
  const parsed = NewReport.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const r = parsed.data;
  if (!getPark(r.parkCode) || !getActivity(r.activity) || (r.trailId && !getTrail(r.trailId))) {
    return NextResponse.json({ error: "Unknown park, activity or trail" }, { status: 400 });
  }
  const [row] = await db.insert(schema.tripReports).values({ ...r, userId: user.id, authorName: user.name }).returning();
  return NextResponse.json({ data: row }, { status: 201 });
}
