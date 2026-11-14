import { NextResponse } from "next/server";
import { getParks } from "@/lib/content";

/** GET /api/parks?activity=kayaking – park index from flat files. */
export async function GET(req: Request) {
  const activity = new URL(req.url).searchParams.get("activity");
  const parks = getParks().filter((p) => !activity || p.activities.includes(activity));
  return NextResponse.json({ total: parks.length, data: parks });
}
