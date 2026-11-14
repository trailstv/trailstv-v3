import { NextResponse } from "next/server";
import { getActivity, getPark } from "@/lib/content";
import { getConditions } from "@/lib/conditions";
import type { ConditionKey } from "@/lib/types";

/**
 * GET /api/parks/:code/conditions?activity=skiing
 * Returns every live condition relevant to an activity (or a sensible default set).
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const park = getPark(code);
  if (!park) return NextResponse.json({ error: "Park not found" }, { status: 404 });

  const slug = new URL(req.url).searchParams.get("activity");
  const activity = slug ? getActivity(slug) : undefined;
  const keys: ConditionKey[] = activity?.conditions ?? ["weather", "alerts", "fire", "air"];

  const data = await getConditions(park, keys);
  return NextResponse.json(
    { park: park.code, activity: activity?.slug ?? null, data },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
