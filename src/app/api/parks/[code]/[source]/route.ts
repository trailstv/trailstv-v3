import { NextResponse } from "next/server";
import { getPark } from "@/lib/content";
import { ALL_CONDITIONS, getCondition } from "@/lib/conditions";
import type { ConditionKey } from "@/lib/types";

/**
 * GET /api/parks/:code/:source
 * source ∈ weather | alerts | air | fire | sun | rivers | snow | avalanche |
 *          tides | campgrounds | boatLaunches | climbingClosures | webcams
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string; source: string }> }) {
  const { code, source } = await params;
  const park = getPark(code);
  if (!park) return NextResponse.json({ error: "Park not found" }, { status: 404 });
  if (!ALL_CONDITIONS.includes(source as ConditionKey)) {
    return NextResponse.json({ error: `Unknown source. Use one of: ${ALL_CONDITIONS.join(", ")}` }, { status: 400 });
  }
  const result = await getCondition(park, source as ConditionKey);
  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
