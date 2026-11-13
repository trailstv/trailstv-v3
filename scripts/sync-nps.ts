/**
 * Pull every park from the NPS API into content/parks/*.json.
 *
 *   NPS_API_KEY=xxx npm run sync:nps            # the 63 "National Park" units
 *   NPS_API_KEY=xxx npm run sync:nps -- --all   # all ~470 NPS units
 *
 * Hand-curated fields already in a file (tideStation, avalancheCenter,
 * radiusKm, highlights, tagline) are preserved on re-sync.
 */
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.NPS_API_KEY;
if (!KEY) throw new Error("Set NPS_API_KEY");
const ALL = process.argv.includes("--all");
const DIR = path.join(process.cwd(), "content", "parks");
const activities: { slug: string; npsActivities: string[] }[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "content", "activities.json"), "utf8"),
);

interface NpsPark {
  parkCode: string; fullName: string; designation: string; states: string; latitude: string; longitude: string;
  description: string; url: string; activities: { name: string }[]; images: { url: string }[];
}

/** Rough default; hand-correct edge cases (AZ, split-zone states) in the JSON. */
function guessTimeZone(lon: number, states: string): string {
  if (states.includes("AZ")) return "America/Phoenix";
  if (states.includes("HI")) return "Pacific/Honolulu";
  if (states.includes("AK")) return "America/Anchorage";
  if (/PR|VI/.test(states)) return "America/Puerto_Rico";
  if (/AS/.test(states)) return "Pacific/Pago_Pago";
  if (/GU|MP/.test(states)) return "Pacific/Guam";
  if (lon < -114.5) return "America/Los_Angeles";
  if (lon < -101.5) return "America/Denver";
  if (lon < -86.5) return "America/Chicago";
  return "America/New_York";
}

async function main() {
  const res = await fetch(`https://developer.nps.gov/api/v1/parks?limit=600&api_key=${KEY}`);
  if (!res.ok) throw new Error(`NPS ${res.status}`);
  const { data } = (await res.json()) as { data: NpsPark[] };
  let n = 0;

  for (const p of data) {
    if (!ALL && !/National Park/.test(p.designation) && !/National Park/.test(p.fullName)) continue;
    if (!p.latitude || !p.longitude) continue;

    const file = path.join(DIR, `${p.parkCode}.json`);
    const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
    const npsNames = new Set(p.activities.map((a) => a.name));
    const mapped = activities.filter((a) => a.npsActivities.some((n) => npsNames.has(n))).map((a) => a.slug);

    const park = {
      code: p.parkCode,
      name: p.fullName,
      states: p.states.split(","),
      lat: Number(p.latitude),
      lon: Number(p.longitude),
      radiusKm: existing.radiusKm ?? 30,
      tagline: existing.tagline || p.description.split(". ")[0] + ".",
      activities: [...new Set([...(existing.activities ?? []), ...mapped])],
      highlights: existing.highlights?.length ? existing.highlights : [],
      url: p.url,
      timeZone: existing.timeZone ?? guessTimeZone(Number(p.longitude), p.states),
      image: p.images[0]?.url,
      // stub flag dropped: this park now has NPS activities + description
      ...(existing.tideStation && { tideStation: existing.tideStation }),
      ...(existing.avalancheCenter && { avalancheCenter: existing.avalancheCenter }),
      ...(existing.trailMinClass && { trailMinClass: existing.trailMinClass }),
    };
    fs.writeFileSync(file, JSON.stringify(park, null, 2) + "\n");
    n++;
  }
  console.log(`Wrote ${n} parks to content/parks`);
}

main().catch((e) => { console.error(e); process.exit(1); });
