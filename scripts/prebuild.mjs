/**
 * Runs automatically before `npm run build` (npm "prebuild" hook).
 * Always creates any missing database tables (db/schema.sql) when DATABASE_URL is set,
 * and the Stripe products/prices (content/products.json) when STRIPE_SECRET_KEY is set.
 * On Vercel, set SYNC_ON_BUILD=1 to refresh the data during each deploy:
 *   1. sync:nps    – every national park's details + activity list (needs NPS_API_KEY)
 *   2. sync:campgrounds – every campground with full details (needs NPS_API_KEY)
 *      SYNC_CAMPSITES=1 adds site-by-site details from Recreation.gov (needs RIDB_API_KEY; adds ~10–15 min)
 *      images:nps – a public-domain NPS hero photo for every park without one of yours
 *   3. sync:trails – every maintained trail in each park (no key needed)
 * Optional SYNC_TRAILS_PARKS="grca zion" limits the trail import to those parks.
 * Anything that fails to download keeps the files already in the project, so the deploy still succeeds.
 */
import { spawnSync } from "node:child_process";

// Always: create any missing database tables (safe, never deletes anything).
spawnSync("node", ["scripts/db-setup.mjs"], { stdio: "inherit" });

// Always (when STRIPE_SECRET_KEY is set): create/update the TrailsTV+ products and prices
// from content/products.json. Idempotent: unchanged prices are left alone.
if (process.env.STRIPE_SECRET_KEY) {
  console.log("\n▶ Checking Stripe products and prices");
  const r = spawnSync("npx", ["tsx", "scripts/stripe-setup.ts"], { stdio: "inherit" });
  if (r.status !== 0) console.warn("⚠ Stripe setup had problems; checkout may not work until it succeeds.");
}

const on = process.env.SYNC_ON_BUILD === "1" || process.env.SYNC_TRAILS_ON_BUILD === "1";
if (!on) process.exit(0);

const run = (label, args) => {
  console.log(`\n▶ ${label}`);
  const r = spawnSync("npx", ["tsx", ...args], { stdio: "inherit" });
  if (r.status !== 0) console.warn(`⚠ ${label} had problems; using the files already in the project.`);
};

if (process.env.NPS_API_KEY) run("Importing parks + activities from the NPS API", ["scripts/sync-nps.ts"]);
else console.warn("⚠ NPS_API_KEY not set: skipping park activities import (only 10 parks will list activities).");

if (process.env.NPS_API_KEY) run("Downloading NPS photos for parks without your own", ["scripts/fetch-park-images.ts"]);

if (process.env.NPS_API_KEY) run("Importing campgrounds from the NPS API", ["scripts/sync-campgrounds.ts", ...(process.env.SYNC_CAMPSITES === "1" ? ["--campsites"] : [])]);
else console.warn("⚠ NPS_API_KEY not set: skipping campgrounds import.");

const parks = (process.env.SYNC_TRAILS_PARKS ?? "").split(/[\s,]+/).filter(Boolean);
run(`Importing NPS trails${parks.length ? ` (${parks.join(", ")})` : " (all parks)"}`, ["scripts/sync-trails.ts", ...parks]);
