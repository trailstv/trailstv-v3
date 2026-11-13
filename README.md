# TrailsTV — viewing America's national parks

Next.js 16 (App Router) on Vercel, with Better Auth accounts, Leaflet maps, Stripe payments, **flat files** for the catalog and **Neon Postgres** for user and time-series data. Live conditions come from free government APIs.

## Architecture

```
content/                  ← flat files (git-versioned, built into the site)
  activities.json         23 activities, each listing the live data it needs
  parks/<code>.json       one file per park (10 seeded; sync script adds all 63 / ~470)
  trails/<code>.json      trails per park (seed data; sync script imports geometry)

src/lib/sources/          ← one client per upstream API, all return SourceResult<T>
  nws.ts      National Weather Service forecast + weather alerts  (no key)
  nps.ts      NPS alerts, campgrounds, webcams, things-to-do, climbing closures (NPS_API_KEY)
  usgs.ts     USGS river flow / gage height / water temp           (no key; optional key)
  snotel.ts   NRCS SNOTEL snow depth + snow-water equivalent       (no key)
  misc.ts     AirNow AQI, NIFC wildfires, NOAA tides, avalanche.org, Recreation.gov RIDB
  sun.ts      sunrise/sunset/twilight, computed locally

src/lib/conditions.ts     maps condition key → source; fetches in parallel, isolates failures
src/lib/db/               Drizzle schema + Neon serverless HTTP client

src/components/map/       ← Leaflet (react-leaflet)
  pins.ts       custom SVG pin designs + colors (edit here to restyle markers)
  icons.ts      turns pins into Leaflet divIcons (cached)
  LeafletMap.tsx  base layers (USGS Topo, OpenTopoMap, Satellite, OSM) + live overlays
  ParkMap.tsx   client-only wrapper (next/dynamic, ssr:false) + legend

content/products.json     ← Stripe catalog (flat file, linked to Stripe by lookup_key)
src/lib/stripe.ts | billing.ts   checkout, fulfillment, entitlements (per user)
src/lib/auth.ts | auth-client.ts  Better Auth (email/password + optional Google), users in Neon
src/lib/user-data.ts      favorites, saves, visited/completed, dashboard stats
src/lib/trips.ts          itineraries: trips, days, ordered stops
src/lib/directions.ts     Google / Apple Maps deep links, multi-stop routes
```

## Accounts & personal features
| Feature | Where | Notes |
|---|---|---|
| **Favorites** ♥ | parks & trails | Things you loved |
| **Save** 🔖 | parks & trails | Your "want to go" list |
| **Visited / Completed** ✓ | parks & trails | A dated log with private notes. Repeat hikes count. Completing a trail marks its park visited. |
| **Itineraries** | `/trips` | Multi-day trips with ordered stops (parks, trails, custom places), times and notes; share by link; calendar export |
| **Directions** | everywhere | Opens Apple Maps on Apple devices and Google Maps elsewhere. Map popups, campgrounds, every stop, and full-day multi-stop routes. |
| **My Parks** | `/me` | Stats (parks, trails, miles, feet climbed), map, and all lists |

Park and trail names and coordinates are always looked up on the server from the flat files, never trusted from the browser. Every write checks ownership, and trips are private unless shared.

## Design & layout
- **Typography:** the logo and all titles (h1–h3) use **Veld** by Migomojo Type House (Black 900, Bold 700, Regular 400). It's self-hosted from `src/fonts/veld/` with `next/font/local`, so it's preloaded and served from your own domain, with no layout shift. Body text uses the system font. Veld is a licensed font, so don't publish the font files in a public repo.
- **Colors** (CSS variables in `src/app/globals.css`): primary steel blue `#3a6a8c` (dark `#1e3a52`), secondary copper `#c27a3a`, tertiary glacier teal `#5e9aa6`, quaternary slate `#8c9aab`. Text and button colors meet WCAG AA contrast.
- **Hero images** behind the header on every public page. The homepage (and general pages) show a random park photo, park and trail pages show that park's photo, and activity pages show the activity's photo or a park's. See `public/images/parks/README.md` and run `npm run images:report`. Images are read at build time, so commit them and redeploy. Pages without a photo get a steel-blue mountain backdrop.
- **Map-left / list-right** (`SplitLayout` + `ExplorerItem`) on the homepage, parks, activities, activity, park and trail pages. Hovering a list item highlights its pin (or every park for an activity), clicking a pin highlights its row, and the search box filters by name or state. On phones the map stacks above the list.
- **Weather icons**: custom SVG set (`src/components/WeatherIcon.tsx`) chosen from the NWS forecast text, with day and night variants.
- **All 64 national parks** are in `content/parks/`. Sequoia & Kings Canyon share one entry, as in NPS data. The 53 added parks are marked `"stub": true` until `npm run sync:nps` fills in activities and descriptions. Chiricahua (AZ) became the 64th park on Oct 20, 2026.

## Trails: every trail in every park (NPS Public Trails)
`npm run sync:trails` imports every public trail for all 64 parks from the official **NPS Public Trails** dataset (public domain), using `mapservices.nps.gov/.../NPS_Public_Trails_Geographic/FeatureServer/0`.

- **Maintained trails only** (default). NPS has no single "maintained" flag, so a segment counts as maintained when it's listed in **FMSS**, the NPS maintenance system (it has an asset or location ID), **or** its **trail class is 2–5**. Class 1 "Minimally Developed" segments are primitive routes and are skipped. The sync prints how many routes it skipped per park.
  - **Stricter for a park:** add `"trailMinClass": 4` to `content/parks/<park>.json`, which keeps highly and fully developed trails only (for example Grand Canyon's corridor trails and Rim Trail). Or run `--min-class 3` once.
  - **Parks with no class or FMSS data:** all public trails are kept and a ⚠ warning is printed, so check those parks.
  - **Everything:** `--all-trails` also imports unmaintained routes.
- **Kept:** trails marked for public display that aren't planned, proposed or decommissioned. Unnamed connector segments are skipped; add `--unnamed` to keep them.
- **Merged:** a trail's segments are joined into one trail with total length, route lines, a start point, surface, NPS trail class, and seasonal or temporarily-closed flags.
- **Uses** come from NPS `TRLUSE` (Hiker/Pedestrian, Bicycle, Pack and Saddle, Snowshoe, Cross-Country Ski, Non-Motorized Watercraft). Standard trails with "Unknown" use count as hiking trails. If you've run `npm run sync:osm` first, dog and wheelchair access and difficulty are added from OpenStreetMap by matching names.
- **Featured trails are kept:** hand-written trails such as Angels Landing keep their stats, permits and hazards. If an NPS trail matches one, the featured trail gets the real route line instead of a duplicate being created.
- **Snow and water trails** are imported too (`trailType: "snow" | "water"`), ready for the snowshoe, ski and paddling phases. Park "hiking" lists show standard trails only.
- **Elevation gain (optional):** `npm run sync:trails -- zion --elevation` samples the USGS 3D Elevation Program at up to 40 points per trail. It's slow, so run it one park at a time. Gains are kept on later runs. Difficulty is then rated with Shenandoah National Park's formula √(gain × 2 × miles): under 50 easy, 50–100 moderate, 100–200 hard, over 200 very hard. Until measured, trails show "—" for gain and "Not rated".
- **Output:** `content/trails/<park>.json` (trail list) and `content/trail-geometry/<park>.json` (routes). Commit both and redeploy. Re-run every few months.
- **Pages:** featured trail pages are pre-built. Imported trail pages are built on first visit and cached, so deploys stay fast with thousands of trails. Park pages list every hiking trail with the trail-use filter, and each one links to its own page with favorites, completions, trips, reports and GPX.

## Trail lines & trail-use filters (OpenStreetMap)
Fallback for any park not yet imported from NPS, and the source of dog, wheelchair and difficulty tags.
`npm run sync:osm` downloads every named trail in each park from OpenStreetMap (the Overpass API), using the park's official boundary or its bounding box as a fallback. It saves `public/data/osm-trails/<park>.geojson`, which Vercel's CDN serves as a static file. Run `npm run sync:osm -- zion yose` for specific parks, and add `--unnamed` to include unnamed paths. A full run takes about 10 minutes because it waits between parks. Re-run monthly and commit the files.

On park pages:
- **Trail use** chips: 🥾 Hiking · 🚵 Biking · 🐎 Horses · 🐕 Dogs · ♿ Wheelchair, with counts. Selecting several shows trails that allow all of them. The filter applies to the map lines, the All trails list and the featured trails.
- Lines are colored by difficulty (from OSM's `sac_scale`). Dashed lines mean unrated. Popups show ✓ / ✕ / ? for each use plus directions to the trail. Hovering a trail in the list zooms to it.
- How uses are read: OSM `foot`, `bicycle`, `horse`, `dog` and `wheelchair` tags (`designated`, `yes`, `permissive`, `leashed` and `limited` count as allowed), with defaults from the path type (`cycleway` → bikes, `bridleway` → horses). If any segment of a named trail prohibits a use, the whole trail is marked not allowed. Untagged means unknown, and unknown never passes a filter. Most national park trails prohibit bikes and dogs, and OSM tagging is incomplete, so the popup reminds people to check posted rules.
- **License:** OSM data is ODbL. Keep the "© OpenStreetMap contributors" credit, which shows automatically. If you redistribute the trail database itself, it must stay ODbL.

## Admin (`/admin`)
**Becoming admin:** set `ADMIN_EMAILS=you@yourdomain.com` in Vercel and sign up with that email. The first time you open `/admin`, your account is promoted, and an **Admin** link appears in the menu. You can make other people admins from their user page. Non-admins get a plain 404, so the admin area doesn't advertise itself.

| Page | What you can do |
|---|---|
| Overview | Users, new sign-ups, paid vs complimentary TrailsTV+, packs sold |
| Users | Search by email or name. Badges show Free / Paid / Comp / Admin. |
| User detail | **Give free access** (TrailsTV+ or a single park pack) for 7 days, 1, 3, 6 or 12 months, until a date, or forever, with a reason. Revoke grants, view payments, link to the Stripe customer, make or remove admins. |
| Complimentary access | Every active grant (or all, including expired and revoked), with one-click revoke |
| Audit log | Every admin action: who, what, when, why |

How complimentary access works: a grant counts exactly like paying while it's active. It unlocks members-only videos, park packs and GPX. Nothing is charged and nothing changes in Stripe. When a grant expires or is revoked, the user is back on their previous plan immediately, with no cron job needed. A paid subscription and a grant can overlap safely.

**Free trials:** add `"trialDays": 7` to a subscription in `content/products.json`. Checkout then offers "Start 7-day free trial", but only to customers who have never subscribed. **Discount codes:** create coupons or promotion codes in the Stripe Dashboard. Checkout already has a promo-code box.

Security: admin status is re-checked in the database on every admin request, so removing an admin takes effect at once. Writes require same-origin form posts, the `role` field can't be set at sign-up, and you can't remove your own admin role.

## Videos (YouTube / Vimeo)
Videos live in flat files, one per park: `content/videos/<parkCode>.json` (see `content/videos/_example.json`).

```json
{ "id": "zion-narrows-walkthrough", "title": "Walking The Narrows", "url": "https://youtu.be/…",
  "slot": "overview", "access": "free", "duration": "6:12", "order": 1 }
```
- `url`: paste any YouTube or Vimeo link (watch, share, Shorts, embed, unlisted Vimeo with hash, `?t=` start times).
- `slot`: where on the page it shows. Each placement is a `<VideoSlot parkCode=… slot="…" />`, and an empty slot renders nothing.
- `access`: `"free"` or `"plus"` (TrailsTV+ members only).
- Entries are validated at build time. A typo or an unsupported link fails the deploy with the file name and the reason.

**Featured video (one large video per park, per activity):** add entries with `"slot": "featured"`. One without `activity` is the park's general video. Ones with `"activity": "kayaking"` etc. replace it when that activity tab is selected, and activities without their own video fall back to the general one. On park pages the featured video **fills the map area by default**, with a Video / Map toggle. Parks without a video just show the map. Trail pages do the same with a video that has `"trailId"` set. Run `npm run videos:report` to see which parks and activities still need videos (it also writes `videos-coverage.csv`).

**Members-only videos:** the page never includes their video ID. The player calls `GET /api/videos/:id/play`, which checks sign-in and TrailsTV+ before returning the embed. A YouTube link can't be truly private, though: anyone who has an unlisted link can watch it. For paid content, use **Vimeo with "Hide from Vimeo" and domain-level privacy** set to your domain, and give it a `poster` image.

Videos load on click (poster first), which keeps park pages fast. Free videos get schema.org `VideoObject` markup for Google video search.

## Maps (Leaflet)
- Trailheads are colored by difficulty. Campgrounds, river gauges and boat launches load as toggleable overlays from `/api/parks/:code/*`, so API keys stay on the server.
- To add a marker type, add a glyph and color in `pins.ts` and use `kind: "yourType"` in a marker.
- **Tile policy:** USGS Topo is public domain. OpenStreetMap and OpenTopoMap tiles are fine for development but not for heavy production traffic. Before launch, use a paid tile provider (MapTiler, Stadia, Thunderforest) or host your own.

## Payments (Stripe)
| Product | Type | Unlocks |
|---|---|---|
| TrailsTV+ Monthly / Yearly | subscription | every park pack and GPX download |
| Offline Park Pack | one-time, per park | that park's pack and GPX downloads |

Flow: a `<form>` posts to `POST /api/checkout`, which requires sign-in and creates or reuses the user's Stripe customer, then sends them to Stripe Checkout. Stripe returns them to `/api/checkout/complete`, which verifies and fulfills the session, then goes to `/account`. Purchases belong to the account, so they work on every device. The **webhook** (`/api/stripe/webhook`) runs the same idempotent fulfillment and keeps subscriptions in sync (renewals, cancellations, failed payments, refunds). Billing management uses the Stripe Customer Portal.

Gated endpoints return `402` without access: `/api/trails/:id/gpx` and `/api/parks/:code/pack`.

**Setup**
1. Add `STRIPE_SECRET_KEY` (test key) and `NEXT_PUBLIC_SITE_URL`.
2. `npm run db:push` creates all tables (auth, user content, billing).
3. `npm run stripe:setup` creates products and prices from `content/products.json`. Edit the prices there first.
4. Locally, run `npm run stripe:listen` (Stripe CLI) and copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET`. Test with card `4242 4242 4242 4242`.
5. In production, go to Dashboard → Webhooks → add `https://<domain>/api/stripe/webhook` with these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created|updated|deleted`, `charge.refunded`.
6. Dashboard → Settings → Billing → **Customer portal**: save the configuration. The "Manage billing" button won't work until you do.

**Before going live:** add Terms, Privacy and refund policy pages, email verification and password reset (Better Auth supports both once you connect an email sender such as Resend), and consider Stripe Tax (`STRIPE_AUTOMATIC_TAX=true`). Don't sell official park passes or permits, because those are sold only through Recreation.gov and NPS.

**Why this split:** parks, trails and activities change slowly and benefit from code review, so they live in git as JSON and pages are statically generated. Trip reports, favorites and condition history are user-generated or time-series, so they go in Neon. Live conditions are fetched on demand and cached in Vercel's Data Cache (from 5 min for alerts up to 1 week for station lists).

## API

| Endpoint | What it returns |
|---|---|
| `GET /api/parks?activity=kayaking` | Park index |
| `GET /api/parks/:code/conditions?activity=skiing` | Every live source relevant to that activity |
| `GET /api/parks/:code/:source` | One source: `weather alerts air fire sun rivers snow avalanche tides campgrounds boatLaunches climbingClosures webcams` |
| `GET /api/trails/:id` | Trail plus trailhead forecast, linked river gauge, and sun times |
| `GET/POST /api/reports` | Trip reports (Neon) |
| `GET/POST /api/me/items` | Favorite / save state; toggle `{kind, refId, field, value}` |
| `POST/DELETE /api/me/completions` | Log or remove a visited park / completed trail |
| `GET/POST /api/trips`, `GET/PATCH/DELETE /api/trips/:id` | Itineraries |
| `POST /api/trips/:id/stops`, `PATCH/DELETE …/stops/:stopId` | Add, reorder (`move: up/down`), re-day, edit, remove stops |
| `GET /api/trips/:id/ics` | Trip as calendar events (one per day) |
| `/api/auth/*` | Better Auth (sign-up, sign-in, Google, sign-out, session) |
| `GET /api/cron/snapshot` | Vercel Cron: saves river, snow and fire readings to Neon |

Each activity in `activities.json` declares its `conditions`. For example, kayaking pulls weather, alerts, rivers, tides and sun, and skiing pulls weather, alerts, snow and avalanche. To add a new activity or data source, add a key to `ConditionKey`, a case in `conditions.ts`, and a renderer in `ConditionsPanel.tsx`.

## Setup

```bash
npm install
cp .env.example .env.local      # add NPS_API_KEY at minimum
npm run dev
```

### Deploy to Vercel + Neon
1. Push to GitHub and import the repo into Vercel.
2. In Vercel, go to **Storage → Marketplace → Neon** and create a database. This sets `DATABASE_URL`.
3. Add `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (your domain), `NPS_API_KEY`, `NWS_USER_AGENT`, and optionally `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `RIDB_API_KEY`, `AIRNOW_API_KEY`, `USGS_API_KEY` and `CRON_SECRET`.
4. Create the tables: `vercel env pull .env.local && npm run db:push`.
5. Load every national park: `npm run sync:nps` (or `-- --all` for all ~470 NPS units). Commit the JSON.

Vercel's Hobby plan runs cron jobs once a day. Upgrade to Pro and change `vercel.json` if you want snapshots more often.

## Free API keys
- NPS: https://www.nps.gov/subjects/developer/get-started.htm (instant)
- Recreation.gov RIDB: https://ridb.recreation.gov (sign in → profile)
- AirNow: https://docs.airnowapi.org
- USGS / api.data.gov: https://api.data.gov/signup (optional; you can reuse the NPS key)

## Important notes
- **USGS:** this project uses the new `api.waterdata.usgs.gov/ogcapi/v1` API. The legacy `waterservices.usgs.gov` is being slowed from Nov 2026 and shut down Feb 2027, so don't copy older tutorials that use it.
- **Seed trail stats** in `content/trails/` are approximate and marked `"verified": false`. Check them against NPS pages before launch.
- **Campsite availability:** RIDB doesn't provide real-time availability. Link users to Recreation.gov to book.
- **Auth:** Better Auth with email/password, plus Google if configured. Trip reports require sign-in. Add rate limiting (Better Auth has a built-in option, or use Vercel's firewall) before launch.

## Roadmap ideas
- Elevation profiles from trail geometry; offline tile bundles inside park packs
- GPX upload and download, offline maps (PWA)
- Search (Postgres full-text or Typesense) across parks, trails and things-to-do
- Climbing routes (OpenBeta GraphQL), paddling routes and river-flow "runnable" ranges per gauge
- Timed-entry and permit reminders, and trend charts from `condition_snapshots`
