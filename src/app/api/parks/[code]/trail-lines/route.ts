import { NextResponse } from "next/server";
import { getPark, getTrailsForPark, getTrailLines, isHikingTrail, trailUses } from "@/lib/content";
import { TRAIL_USES, type OsmTrailCollection, type OsmTrailFeature } from "@/lib/osm-trails";
import { fetchNpsTrailFeatures, groupFeatures, groupMiles, hasMaintenanceData } from "@/lib/nps-trails";

export const revalidate = 86400;

/**
 * GET /api/parks/:code/trail-lines
 * The park's hiking trails (NPS import + featured trails) as GeoJSON for the map and the
 * "All hiking trails" list. Parks that haven't been imported yet are read live from the
 * NPS Public Trails service (same "maintained trails" rules as the import, cached a day),
 * so every park shows its trails even before `npm run sync:trails` has run.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const park = getPark((await params).code);
  if (!park) return NextResponse.json({ error: "Park not found" }, { status: 404 });

  const features: OsmTrailFeature[] = getTrailsForPark(park.code)
    .filter(isHikingTrail)
    .map((t) => ({ t, lines: getTrailLines(t) }))
    .filter(({ lines }) => lines.length > 0)
    .map(({ t, lines }) => {
      const uses = trailUses(t);
      return {
        type: "Feature" as const,
        properties: {
          id: t.id, name: t.name, lengthMi: t.distanceMi, href: `/trails/${t.id}`,
          // NPS lists allowed uses; anything not listed is shown as "not recorded".
          uses: Object.fromEntries(TRAIL_USES.map((u) => [u, uses.includes(u) ? "yes" : null])) as OsmTrailFeature["properties"]["uses"],
          difficulty: t.difficulty, surface: t.surface ?? null, osmWays: [],
        },
        geometry: { type: "MultiLineString" as const, coordinates: lines },
      };
    })
    .sort((a, b) => b.properties.lengthMi - a.properties.lengthMi);

  // Not imported yet (only hand-written featured trails, or nothing): read the NPS service live.
  if (!getTrailsForPark(park.code).some((t) => t.source === "nps")) {
    const live = await liveTrails(park.code, (park as { trailMinClass?: number }).trailMinClass);
    const have = new Set(features.map((f) => f.properties.name.toLowerCase()));
    features.push(...live.filter((f) => !have.has(f.properties.name.toLowerCase())));
    features.sort((a, b) => b.properties.lengthMi - a.properties.lengthMi);
  }

  const body: OsmTrailCollection & { source: string } = {
    type: "FeatureCollection", source: "nps", park: park.code, generatedAt: new Date().toISOString(),
    attribution: "National Park Service", features,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}

/** Maintained hiking trails straight from the NPS service (no trail pages yet, so no links). */
async function liveTrails(code: string, minClass = 2): Promise<OsmTrailFeature[]> {
  try {
    const raw = await fetchNpsTrailFeatures(code, { next: { revalidate: 86400 } });
    const groups = groupFeatures(raw, { maintainedOnly: hasMaintenanceData(raw), minClass });
    return groups
      .filter((g) => g.type === "terra" && g.uses.has("hike") && !g.closed)
      .map((g) => ({ g, miles: groupMiles(g) }))
      .filter(({ miles }) => miles >= 0.1)
      .map(({ g, miles }, i) => ({
        type: "Feature" as const,
        properties: {
          id: `${code}-live-${i}`, name: g.name, lengthMi: miles,
          uses: Object.fromEntries(TRAIL_USES.map((u) => [u, g.uses.has(u as never) ? "yes" : null])) as OsmTrailFeature["properties"]["uses"],
          difficulty: null, surface: g.surface, osmWays: [],
        },
        geometry: { type: "MultiLineString" as const, coordinates: g.lines },
      }));
  } catch (e) {
    console.warn(`[trail-lines] live NPS trails for ${code} failed: ${(e as Error).message}`);
    return [];
  }
}
