/**
 * Which parks still need a hero image, and what to name each file.
 *   npm run images:report
 * Put images in public/images/parks/ (jpg/webp/png/avif). Recommended: landscape, at least 2400px wide, under ~600 KB.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dir = path.join(root, "public/images/parks");
const have = new Set((fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => path.parse(f).name.toLowerCase()));
const slug = (name: string) => name
  .replace(/^National Park of (the )?/i, "").replace(/ National (and State )?Parks?( and Preserve)?$/i, "")
  .normalize("NFKD").replace(/[̀-ͯʻʼ']/g, "").replace(/&/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const parks = fs.readdirSync(path.join(root, "content/parks")).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(root, "content/parks", f), "utf8")) as { code: string; name: string })
  .sort((a, b) => a.name.localeCompare(b.name));
let missing = 0;
for (const p of parks) {
  const s = slug(p.name);
  const ok = have.has(s) || have.has(p.code);
  if (!ok) missing++;
  console.log(`${ok ? "✓" : "✗"} ${(s + ".jpg").padEnd(34)} ${p.name}`);
}
console.log(`\n${parks.length - missing}/${parks.length} parks have hero images. Folder: public/images/parks/`);
