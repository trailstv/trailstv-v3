import { NextResponse } from "next/server";
import { getPark, getTrailsForPark, getTrailLines } from "@/lib/content";
import { getUser } from "@/lib/auth";
import { canDownloadPark, getUserEntitlements } from "@/lib/billing";

/**
 * GET /api/parks/:code/pack – the offline park pack (GeoJSON).
 * Extend this into a zip with GPX files and pre-rendered map tiles for a true offline experience.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const park = getPark((await params).code);
  if (!park) return NextResponse.json({ error: "Park not found" }, { status: 404 });

  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to download", login: "/login" }, { status: 401 });
  const ent = await getUserEntitlements(user.id);
  if (!canDownloadPark(ent, park.code)) {
    return NextResponse.json({ error: "Purchase this park's offline pack or TrailsTV+", upgrade: "/pricing" }, { status: 402 });
  }

  const trails = getTrailsForPark(park.code);
  const geojson = {
    type: "FeatureCollection",
    properties: { park, generatedAt: new Date().toISOString() },
    features: trails.flatMap((t) => [
      { type: "Feature", properties: { kind: "trailhead", trailId: t.id, name: t.trailhead.name }, geometry: { type: "Point", coordinates: [t.trailhead.lon, t.trailhead.lat] } },
      ...(getTrailLines(t).length ? [{ type: "Feature", properties: { kind: "trail", ...t, geometry: undefined }, geometry: { type: "MultiLineString", coordinates: getTrailLines(t) } }] : []),
    ]),
  };
  return NextResponse.json(geojson, {
    headers: { "Content-Disposition": `attachment; filename="${park.code}-offline-pack.geojson"`, "Cache-Control": "private, no-store" },
  });
}
