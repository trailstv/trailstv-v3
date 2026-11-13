import { NextResponse } from "next/server";
import { getTrail, getTrailLines } from "@/lib/content";
import { getUser } from "@/lib/auth";
import { canDownloadPark, getUserEntitlements } from "@/lib/billing";

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** GET /api/trails/:id/gpx – premium: TrailsTV+ or that park's offline pack. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const trail = getTrail((await params).id);
  if (!trail) return NextResponse.json({ error: "Trail not found" }, { status: 404 });

  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to download", login: "/login" }, { status: 401 });
  const ent = await getUserEntitlements(user.id);
  if (!canDownloadPark(ent, trail.parkCode)) {
    return NextResponse.json({ error: "GPX downloads need TrailsTV+ or this park's offline pack", upgrade: "/pricing" }, { status: 402 });
  }

  const segs = getTrailLines(trail);
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailsTV" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(trail.name)}</name></metadata>
  <wpt lat="${trail.trailhead.lat}" lon="${trail.trailhead.lon}"><name>${esc(trail.trailhead.name)}</name></wpt>
${segs.length ? `  <trk><name>${esc(trail.name)}</name>\n${segs.map((pts) => `    <trkseg>\n${pts.map(([lon, lat]) => `      <trkpt lat="${lat}" lon="${lon}"/>`).join("\n")}\n    </trkseg>`).join("\n")}\n  </trk>` : ""}
</gpx>`;

  return new NextResponse(gpx, {
    headers: { "Content-Type": "application/gpx+xml", "Content-Disposition": `attachment; filename="${trail.id}.gpx"`, "Cache-Control": "private, no-store" },
  });
}
