/**
 * Downloads the photos listed in content/activity-images.json into
 * public/images/activities/<slug>.jpg (max 2400px wide, ~q80) and records credits.
 *   npm run images:activities            # skips files that already exist
 *   npm run images:activities -- --force # re-download everything
 * Accepts NPGallery AssetDetail links, Unsplash photo links, or any direct image URL.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outDir = path.join(root, "public/images/activities");
const creditsFile = path.join(outDir, "credits.json");
const force = process.argv.includes("--force");

type Entry = { url: string; credit?: string; note?: string };
const manifest = JSON.parse(fs.readFileSync(path.join(root, "content/activity-images.json"), "utf8")) as Record<string, Entry | string>;

/** Turn a gallery page link into a direct download link. */
export function downloadUrl(url: string): string {
  const nps = url.match(/npgallery(?:\.nps\.gov|)\/(?:[A-Z]+\/)?AssetDetail\/([0-9a-f-]+)/i) ?? url.match(/nps\.gov\/npgallery\/(?:[A-Z]+\/)?AssetDetail\/([0-9a-f-]+)/i);
  if (nps) return `https://npgallery.nps.gov/GetAsset/${nps[1]}`;
  const uns = url.match(/unsplash\.com\/photos\/(?:[^/?#]*-)?([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
  if (uns) return `https://unsplash.com/photos/${uns[1]}/download?force=true`;
  return url;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const credits: Record<string, string> = fs.existsSync(creditsFile) ? JSON.parse(fs.readFileSync(creditsFile, "utf8")) : {};
  let ok = 0, failed = 0, skipped = 0;
  for (const [slug, raw] of Object.entries(manifest)) {
    if (slug.startsWith("_") || typeof raw !== "object") continue;
    const file = `${slug}.jpg`;
    const dest = path.join(outDir, file);
    if (fs.existsSync(dest) && !force) { skipped++; console.log(`· ${file} already there`); continue; }
    try {
      const res = await fetch(downloadUrl(raw.url), { redirect: "follow", headers: { "User-Agent": "TrailsTV image fetch" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await sharp(buf).rotate().resize({ width: 2400, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toFile(dest);
      if (raw.credit) credits[file] = raw.credit;
      ok++;
      console.log(`✓ ${file.padEnd(28)} ${(fs.statSync(dest).size / 1024).toFixed(0)} KB  ${raw.note ?? ""}`);
    } catch (e) {
      failed++;
      console.log(`✗ ${file.padEnd(28)} ${(e as Error).message}  (${raw.url})`);
    }
  }
  fs.writeFileSync(creditsFile, JSON.stringify(credits, null, 2) + "\n");
  console.log(`\n${ok} downloaded, ${skipped} skipped, ${failed} failed → public/images/activities/`);
}

main();
