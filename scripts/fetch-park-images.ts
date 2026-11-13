/**
 * Download a hero photo for every park from the NPS API (public-domain park photos).
 *
 *   npm run images:nps                 # parks that don't have a photo yet
 *   npm run images:nps -- yose zion    # only these parks
 *   npm run images:nps -- --refresh    # re-pick photos this script downloaded before
 *
 * Saves public/images/parks/<park-slug>.jpg (2400px max) and the photographer credit in
 * credits.json. Your own photos always win: a file this script didn't create is never touched.
 * Photos marked © (not public domain) are skipped. Needs NPS_API_KEY.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public/images/parks");
const MANIFEST = path.join(ROOT, "content/nps-park-photos.json"); // files this script owns (yours are never touched)
const CREDITS = path.join(OUT, "credits.json");
const EXTS = [".jpg", ".jpeg", ".webp", ".avif", ".png"];
const args = process.argv.slice(2);
const refresh = args.includes("--refresh");
const codes = args.filter((a) => !a.startsWith("--"));
const KEY = process.env.NPS_API_KEY;

/** Same rule as src/lib/hero.ts parkSlug(). */
export function parkSlug(name: string) {
  return name
    .replace(/^National Park of (the )?/i, "")
    .replace(/ National (and State )?Parks?( and Preserve)?$/i, "")
    .normalize("NFKD").replace(/[̀-ͯʻʼ']/g, "")
    .replace(/&/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

interface NpsImage { url: string; credit: string; altText: string; title: string; caption: string }

/** Public domain only: NPS credits like "NPS Photo / Jane Doe"; skip "©" and "courtesy of" credits. */
export function usable(img: NpsImage): boolean {
  const c = `${img.credit} ${img.caption}`;
  return /^https?:\/\//.test(img.url) && !/©|\(c\)|copyright|all rights reserved|courtesy/i.test(c);
}

export function creditLine(img: NpsImage): string {
  const c = (img.credit || "NPS").replace(/\s+/g, " ").trim();
  return /^photo/i.test(c) ? c : `Photo: ${c}`;
}

const readJson = <T,>(f: string, d: T): T => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };

async function main() {
  if (!KEY) throw new Error("Set NPS_API_KEY (free: https://www.nps.gov/subjects/developer/get-started.htm)");
  fs.mkdirSync(OUT, { recursive: true });
  const parkDir = path.join(ROOT, "content/parks");
  const parks = fs.readdirSync(parkDir).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(parkDir, f), "utf8")) as { code: string; name: string })
    .filter((p) => !codes.length || codes.includes(p.code));

  const owned = new Set(readJson<string[]>(MANIFEST, []));
  const credits = readJson<Record<string, string>>(CREDITS, {});
  const existing = fs.readdirSync(OUT).filter((f) => EXTS.includes(path.extname(f).toLowerCase()));
  const has = (base: string) => existing.find((f) => path.parse(f).name.toLowerCase() === base);

  const todo = parks.filter((p) => {
    const file = has(parkSlug(p.name)) ?? has(p.code);
    if (!file) return true;
    return refresh && owned.has(file); // never replace your own photos
  });
  if (!todo.length) { console.log("Every park already has a photo. (Use --refresh to re-pick NPS ones.)"); return; }

  const r = await fetch(`https://developer.nps.gov/api/v1/parks?parkCode=${todo.map((p) => p.code).join(",")}&limit=100&fields=images&api_key=${KEY}`);
  if (!r.ok) throw new Error(`NPS API HTTP ${r.status}`);
  const data = ((await r.json()) as { data: { parkCode: string; images: NpsImage[] }[] }).data;

  let ok = 0;
  for (const p of todo) {
    const imgs = (data.find((d) => d.parkCode === p.code)?.images ?? []).filter(usable);
    const file = `${parkSlug(p.name)}.jpg`;
    let saved = false;
    // Try photos in NPS order; keep the first landscape one that's big enough for a hero.
    for (const img of imgs.slice(0, 6)) {
      try {
        const res = await fetch(img.url, { headers: { "User-Agent": "TrailsTV image fetch" } });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        const meta = await sharp(buf).metadata();
        if (!meta.width || !meta.height || meta.width < 1000 || meta.width < meta.height * 1.2) continue;
        await sharp(buf).rotate().resize({ width: 2400, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(OUT, file));
        credits[file] = creditLine(img);
        owned.add(file);
        console.log(`✓ ${p.code}  ${file.padEnd(34)} ${meta.width}×${meta.height}  ${credits[file]}`);
        saved = true; ok++;
        break;
      } catch { /* try the next photo */ }
    }
    if (!saved) console.log(`· ${p.code}  no usable public-domain landscape photo (${imgs.length} checked)`);
  }
  fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2) + "\n");
  fs.writeFileSync(MANIFEST, JSON.stringify([...owned].sort(), null, 2) + "\n");
  console.log(`\n${ok} park photos saved to public/images/parks`);
}

if (process.argv[1]?.includes("fetch-park-images")) main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
