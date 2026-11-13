/**
 * Which parks / activities still need a featured video?
 *
 *   npm run videos:report          # summary in the terminal
 *   → also writes videos-coverage.csv (open in Sheets/Excel to plan filming or sourcing)
 *
 * Reads the flat files directly (no server needed).
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const activities: { slug: string; name: string }[] = read("content/activities.json");
const parks = fs.readdirSync(path.join(root, "content/parks")).filter((f) => f.endsWith(".json")).map((f) => read(`content/parks/${f}`) as { code: string; name: string; activities: string[] });
const videoDir = path.join(root, "content/videos");

type V = { id: string; slot?: string; activity?: string; access?: string };
const videosFor = (code: string): V[] => {
  const f = path.join(videoDir, `${code}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
};

const rows: string[][] = [["park_code", "park", "activity", "status", "video_id", "access"]];
let have = 0, need = 0;

for (const p of parks.sort((a, b) => a.name.localeCompare(b.name))) {
  const featured = videosFor(p.code).filter((v) => (v.slot ?? "overview") === "featured");
  const general = featured.find((v) => !v.activity);
  const missing: string[] = [];
  rows.push([p.code, p.name, "(general)", general ? "has video" : "MISSING", general?.id ?? "", general?.access ?? ""]);
  general ? have++ : (need++, missing.push("general"));
  for (const slug of p.activities) {
    const v = featured.find((x) => x.activity === slug);
    rows.push([p.code, p.name, slug, v ? "has video" : general ? "uses general" : "MISSING", v?.id ?? "", v?.access ?? ""]);
    v ? have++ : (need++, missing.push(slug));
  }
  console.log(`${general ? "✓" : "✗"} ${p.name.padEnd(40)} ${p.activities.length + 1 - missing.length}/${p.activities.length + 1}${missing.length ? "  missing: " + missing.join(", ") : ""}`);
}

const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
fs.writeFileSync(path.join(root, "videos-coverage.csv"), csv + "\n");
console.log(`\n${have} featured videos assigned, ${need} slots open across ${parks.length} parks. Wrote videos-coverage.csv`);
