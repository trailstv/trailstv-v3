import { NextResponse } from "next/server";
import { getPark, getTrail } from "@/lib/content";
import { getForecast } from "@/lib/sources/nws";
import { getGauge } from "@/lib/sources/usgs";
import { getSunTimes } from "@/lib/sources/sun";

/** GET /api/trails/:id – trail data + trailhead-specific forecast and gauge. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trail = getTrail(id);
  if (!trail) return NextResponse.json({ error: "Trail not found" }, { status: 404 });
  const { lat, lon } = trail.trailhead;
  const [forecast, gauge] = await Promise.all([
    getForecast(lat, lon),
    trail.usgsSite ? getGauge(trail.usgsSite) : Promise.resolve(null),
  ]);
  return NextResponse.json({
    trail,
    park: getPark(trail.parkCode),
    conditions: { forecast, gauge, sun: getSunTimes(lat, lon) },
  });
}
