/**
 * Import every campground in the national parks so all camping details live on TrailsTV.
 *
 *   npm run sync:campgrounds                       # all parks (needs NPS_API_KEY)
 *   npm run sync:campgrounds -- yose zion          # specific parks
 *   npm run sync:campgrounds -- --campsites        # also site-by-site details (needs RIDB_API_KEY; slow, ~1 req/sec)
 *   npm run sync:campgrounds -- --from-file nps-campgrounds.json   # offline: a saved NPS /campgrounds response
 *
 * Sources (both public domain, US government):
 *   NPS API /campgrounds          → content/campgrounds/<park>.json
 *   Recreation.gov RIDB campsites → content/campsites/<campground-id>.json   (with --campsites)
 * Visitors only leave TrailsTV to pay: the Recreation.gov link is kept solely for the Reserve button.
 */
import fs from "node:fs";
import path from "node:path";
import type { Campground, Campsite, CampgroundSeason } from "../src/lib/campground-types";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const withCampsites = args.includes("--campsites");
const fromIdx = args.indexOf("--from-file");
const fromFile = fromIdx >= 0 ? args[fromIdx + 1] : null;
const ridbFromIdx = args.indexOf("--campsites-from");
const ridbFromDir = ridbFromIdx >= 0 ? args[ridbFromIdx + 1] : null; // offline: dir of <recGovId>.json RIDB responses
const skip = new Set([fromIdx + 1, ridbFromIdx + 1].filter((i) => i > 0));
const codes = args.filter((a, i) => !a.startsWith("--") && !skip.has(i));
const NPS_KEY = process.env.NPS_API_KEY;
const RIDB_KEY = process.env.RIDB_API_KEY;

/* ------------------------------ helpers ------------------------------ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").replace(/-?campground$/, "") || "campground";
}

/** NPS text sometimes carries HTML; keep paragraphs, drop tags. */
export function cleanText(s: unknown): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/\s*(p|div|li|h\d)\s*>/gi, "\n").replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&ndash;/g, "–").replace(/&mdash;/g, "—").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const num = (v: unknown): number => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; };
const coord = (v: unknown): number | null => { const s = String(v ?? "").trim(); const n = Number(s); return s && Number.isFinite(n) && n !== 0 ? n : null; };
const numOrNull = (v: unknown): number | null => { const s = String(v ?? "").trim(); if (!s || s === "0") return null; const n = Number(s.replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const yesNo = (v: unknown): boolean | null => { const s = String(v ?? "").trim().toLowerCase(); return s === "1" || s === "true" || s.startsWith("yes") ? true : s === "0" || s === "false" || s.startsWith("no") ? false : null; };
const str = (v: unknown) => (typeof v === "string" ? cleanText(v) : Array.isArray(v) ? v.filter(Boolean).join(", ") : "");
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => cleanText(String(x))).filter(Boolean) : typeof v === "string" && v.trim() ? [cleanText(v)] : []);

export function recGovIdFrom(url: unknown): string | null {
  const m = String(url ?? "").match(/recreation\.gov\/camping\/(?:campgrounds|gateways)\/(\d+)/i);
  return m ? m[1] : null;
}

/* --------------------------- NPS → Campground --------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizeCampground(raw: any, id: string): Campground {
  const a = raw.amenities ?? {};
  const acc = raw.accessibility ?? {};
  const cs = raw.campsites ?? {};
  const lat = coord(raw.latitude), lon = coord(raw.longitude);
  const addr = (raw.addresses ?? []).find((x: any) => x.type === "Physical") ?? raw.addresses?.[0];
  const seasons: CampgroundSeason[] = (raw.operatingHours ?? []).map((h: any) => ({
    name: cleanText(h.name), description: cleanText(h.description),
    hours: Object.fromEntries(Object.entries(h.standardHours ?? {}).map(([d, v]) => [d, String(v)])),
    exceptions: (h.exceptions ?? []).map((e: any) => ({ name: cleanText(e.name), start: e.startDate ?? "", end: e.endDate ?? "", closed: Object.values(e.exceptionHours ?? {}).every((v) => v === "Closed") })),
  }));
  return {
    id,
    npsId: raw.id,
    parkCode: raw.parkCode,
    name: cleanText(raw.name),
    lat: lat != null && lon != null ? lat : null,
    lon: lat != null && lon != null ? lon : null,
    description: cleanText(raw.description),
    recGovId: recGovIdFrom(raw.reservationUrl),
    reservationUrl: /^https?:\/\//.test(raw.reservationUrl ?? "") ? raw.reservationUrl : null,
    reservationInfo: cleanText(raw.reservationInfo),
    sitesReservable: num(raw.numberOfSitesReservable),
    sitesFirstCome: num(raw.numberOfSitesFirstComeFirstServe),
    sites: { total: num(cs.totalSites), tentOnly: num(cs.tentOnly), rvOnly: num(cs.rvOnly), electrical: num(cs.electricalHookups), group: num(cs.group), horse: num(cs.horse), walkBoatTo: num(cs.walkBoatTo), other: num(cs.other) },
    seasons,
    fees: (raw.fees ?? []).map((f: any) => ({ title: cleanText(f.title), cost: f.cost != null && f.cost !== "" ? Number(f.cost) : null, description: cleanText(f.description) })),
    amenities: {
      toilets: list(a.toilets), showers: list(a.showers), potableWater: list(a.potableWater),
      dumpStation: str(a.dumpStation), laundry: str(a.laundry), campStore: str(a.campStore), firewood: str(a.firewoodForSale), ice: str(a.iceAvailableForSale),
      foodStorage: str(a.foodStorageLockers), trash: str(a.trashRecyclingCollection), amphitheater: str(a.amphitheater), host: str(a.staffOrVolunteerHostOnsite),
      cellReception: str(a.cellPhoneReception), internet: str(a.internetConnectivity),
    },
    access: {
      wheelchair: str(acc.wheelchairAccess), adaInfo: str(acc.adaInfo),
      rvAllowed: yesNo(acc.rvAllowed), rvMaxLength: numOrNull(acc.rvMaxLength), rvInfo: str(acc.rvInfo),
      trailerAllowed: yesNo(acc.trailerAllowed), trailerMaxLength: numOrNull(acc.trailerMaxLength),
      accessRoads: list(acc.accessRoads), classifications: list(acc.classifications),
      fireStovePolicy: str(acc.fireStovePolicy), cellPhoneInfo: str(acc.cellPhoneInfo), internetInfo: str(acc.internetInfo), additionalInfo: str(acc.additionalInfo),
    },
    directions: cleanText(raw.directionsOverview),
    weather: cleanText(raw.weatherOverview),
    regulations: cleanText(raw.regulationsOverview),
    address: addr ? { line1: cleanText(addr.line1), city: cleanText(addr.city), state: addr.stateCode ?? "", zip: addr.postalCode ?? "" } : null,
    phone: raw.contacts?.phoneNumbers?.find((p: any) => p.type === "Voice")?.phoneNumber ?? raw.contacts?.phoneNumbers?.[0]?.phoneNumber ?? null,
    email: raw.contacts?.emailAddresses?.[0]?.emailAddress ?? null,
    photos: (raw.images ?? []).filter((i: any) => /^https?:\/\//.test(i.url ?? "")).map((i: any) => ({ url: i.url, alt: cleanText(i.altText) || cleanText(i.title), title: cleanText(i.title), caption: cleanText(i.caption), credit: cleanText(i.credit) })),
    campsiteCount: 0,
    updated: raw.lastIndexedDate ?? "",
  };
}

/* ------------------------- RIDB → Campsite ------------------------- */

export function normalizeCampsite(raw: any): Campsite {
  const attrs: Record<string, string> = {};
  for (const x of raw.ATTRIBUTES ?? []) if (x?.AttributeName) attrs[String(x.AttributeName).toLowerCase()] = String(x.AttributeValue ?? "").trim();
  const get = (...keys: string[]) => { for (const k of keys) { const v = attrs[k.toLowerCase()]; if (v && v.toLowerCase() !== "n/a") return v; } return ""; };
  const equipment = (raw.PERMITTEDEQUIPMENT ?? []).map((e: any) => ({ name: String(e.EquipmentName ?? ""), maxLength: numOrNull(e.MaxLength) })).filter((e: { name: string }) => e.name);
  const lengths = equipment.map((e: { maxLength: number | null }) => e.maxLength ?? 0).concat(num(get("Max Vehicle Length")));
  const hookups = [["Electricity Hookup", "Electric"], ["Water Hookup", "Water"], ["Sewer Hookup", "Sewer"]]
    .filter(([k]) => { const v = get(k); return v && !/^(n|no|0)$/i.test(v); })
    .map(([k, label]) => { const v = get(k); return /^\d/.test(v) ? `${label} ${v}${/amp/i.test(v) ? "" : " amp"}` : label; });
  const features = [["Fire Pit", "Fire pit"], ["Picnic Table", "Picnic table"], ["Tent Pad", "Tent pad"], ["BBQ", "Grill"], ["Grills/Fire Ring", "Grill / fire ring"], ["Lantern Pole", "Lantern pole"], ["Food Storage Locker", "Food locker"], ["Proximity to Water", "Near water"]]
    .filter(([k]) => { const v = get(k); return v && !/^(n|no|0|none)$/i.test(v); })
    .map(([k, label]) => (k === "Proximity to Water" ? `${label} (${get(k)})` : label));
  const drive = [get("Driveway Entry"), get("Driveway Surface"), get("Driveway Length") && `${get("Driveway Length")} ft`, get("Driveway Grade") && `${get("Driveway Grade")} grade`].filter(Boolean).join(" · ");
  const lat = coord(raw.CampsiteLatitude), lon = coord(raw.CampsiteLongitude);
  return {
    id: String(raw.CampsiteID),
    name: String(raw.CampsiteName ?? "").trim(),
    loop: String(raw.Loop ?? "").trim(),
    type: String(raw.CampsiteType ?? "").trim(),
    use: String(raw.TypeOfUse ?? "").trim(),
    accessible: raw.CampsiteAccessible === true || yesNo(get("Accessibility")) === true,
    reservable: raw.CampsiteReservable !== false,
    lat: lat != null && lon != null ? lat : null,
    lon: lat != null && lon != null ? lon : null,
    maxPeople: numOrNull(get("Max Num of People")),
    maxVehicles: numOrNull(get("Max Num of Vehicles")),
    maxLength: Math.max(0, ...lengths) || null,
    equipment,
    driveway: drive,
    shade: get("Shade"),
    pets: get("Pets Allowed"),
    campfire: get("Campfire Allowed"),
    hookups,
    features,
    checkin: get("Checkin Time"),
    checkout: get("Checkout Time"),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Natural sort: Loop A site 2 before site 10. */
export function sortSites(a: Campsite, b: Campsite) {
  return a.loop.localeCompare(b.loop, undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true });
}

/* ------------------------------ fetching ------------------------------ */

async function getJson(url: string, headers: Record<string, string> = {}, tries = 3): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "TrailsTV campground sync", ...headers } });
      if (r.status === 429 && i < tries) { await sleep(15000 * i); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(2000 * i);
    }
  }
}

async function fetchNpsCampgrounds(parkCodes: string[]): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (fromFile) return (JSON.parse(fs.readFileSync(fromFile, "utf8")).data ?? []);
  if (!NPS_KEY) throw new Error("Set NPS_API_KEY (free: https://www.nps.gov/subjects/developer/get-started.htm)");
  const out = [];
  // Ask in batches of parks so each request stays small.
  for (let i = 0; i < parkCodes.length; i += 10) {
    const batch = parkCodes.slice(i, i + 10).join(",");
    for (let start = 0; ; start += 100) {
      const j = await getJson(`https://developer.nps.gov/api/v1/campgrounds?parkCode=${batch}&limit=100&start=${start}&api_key=${NPS_KEY}`);
      out.push(...(j.data ?? []));
      if ((j.data?.length ?? 0) < 100) break;
    }
    await sleep(300);
  }
  return out;
}

async function fetchCampsites(recGovId: string): Promise<any[] | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (ridbFromDir) { const f = path.join(ridbFromDir, `${recGovId}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")).RECDATA ?? [] : null; }
  if (!RIDB_KEY) return null;
  const out = [];
  for (let offset = 0; ; offset += 50) {
    const j = await getJson(`https://ridb.recreation.gov/api/v1/facilities/${recGovId}/campsites?limit=50&offset=${offset}`, { apikey: RIDB_KEY });
    out.push(...(j.RECDATA ?? []));
    await sleep(1300); // RIDB allows ~50 requests/minute
    const total = j.METADATA?.RESULTS?.TOTAL_COUNT ?? 0;
    if (!j.RECDATA?.length || out.length >= total) break;
  }
  return out;
}

/** Campgrounds without a Recreation.gov link in NPS data: look one up by name near the campground. */
async function findRecGovId(c: Campground): Promise<string | null> {
  if (!RIDB_KEY || ridbFromDir || c.lat == null || c.lon == null) return null;
  const q = new URLSearchParams({ query: c.name.replace(/campground/i, "").trim(), latitude: String(c.lat), longitude: String(c.lon), radius: "5", limit: "10" });
  const j = await getJson(`https://ridb.recreation.gov/api/v1/facilities?${q}`, { apikey: RIDB_KEY });
  await sleep(1300);
  const want = slugify(c.name);
  const hit = (j.RECDATA ?? []).find((f: { FacilityTypeDescription: string; FacilityName: string }) => /campground/i.test(f.FacilityTypeDescription) && (slugify(f.FacilityName).includes(want) || want.includes(slugify(f.FacilityName))));
  return hit ? String(hit.FacilityID) : null;
}

/* -------------------------------- main -------------------------------- */

async function main() {
  const parkDir = path.join(ROOT, "content/parks");
  const allParks = fs.readdirSync(parkDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(parkDir, f), "utf8")) as { code: string; name: string });
  const targets = codes.length ? allParks.filter((p) => codes.includes(p.code)) : allParks;
  if (!targets.length) throw new Error(`No matching parks: ${codes.join(", ")}`);
  const raw = (await fetchNpsCampgrounds(targets.map((p) => p.code))).filter((c) => targets.some((p) => p.code === c.parkCode));

  const outDir = path.join(ROOT, "content/campgrounds");
  const siteDir = path.join(ROOT, "content/campsites");
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(siteDir, { recursive: true });

  let totalCamps = 0, totalSites = 0;
  for (const park of targets.sort((a, b) => a.code.localeCompare(b.code))) {
    const used = new Set<string>();
    const camps = raw
      .filter((c) => c.parkCode === park.code)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map((r) => {
        let id = `${park.code}-${slugify(r.name)}`;
        for (let n = 2; used.has(id); n++) id = `${park.code}-${slugify(r.name)}-${n}`;
        used.add(id);
        return normalizeCampground(r, id);
      });

    let withSites = 0;
    for (const c of camps) {
      const siteFile = path.join(siteDir, `${c.id}.json`);
      if (withCampsites) {
        try {
          c.recGovId ??= await findRecGovId(c);
          const sites = c.recGovId ? await fetchCampsites(c.recGovId) : null;
          if (sites?.length) {
            const list = sites.map(normalizeCampsite).sort(sortSites);
            fs.writeFileSync(siteFile, JSON.stringify(list) + "\n");
          }
        } catch (e) { console.warn(`   ⚠ ${c.name}: campsites ${(e as Error).message} (keeping previous file)`); }
      }
      // Keep previously imported campsite files when not re-fetching.
      if (fs.existsSync(siteFile)) { c.campsiteCount = (JSON.parse(fs.readFileSync(siteFile, "utf8")) as unknown[]).length; withSites++; totalSites += c.campsiteCount; }
    }

    const file = path.join(outDir, `${park.code}.json`);
    if (camps.length) fs.writeFileSync(file, JSON.stringify(camps, null, 1) + "\n");
    else if (fs.existsSync(file) && !fromFile) fs.rmSync(file);
    totalCamps += camps.length;
    const sites = camps.reduce((s, c) => s + c.sites.total, 0);
    if (camps.length) console.log(`${park.code.padEnd(5)} ${String(camps.length).padStart(3)} campgrounds ${String(sites).padStart(5)} sites${withSites ? `  (${withSites} with site-by-site details)` : ""}  ${park.name}`);
  }
  console.log(`\n${totalCamps} campgrounds written to content/campgrounds${totalSites ? `, ${totalSites} campsites in content/campsites` : ""}`);
  if (!withCampsites) console.log("Tip: add --campsites (with RIDB_API_KEY) for site-by-site details: sizes, hookups, shade, accessibility.");
}

if (process.argv[1]?.includes("sync-campgrounds")) main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
