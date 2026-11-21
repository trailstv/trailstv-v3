import { titleCase } from "@/lib/title-case";
import Link from "next/link";
import { getAccess, isPaid, FEATURE_COPY } from "@/lib/paywall";
import { Teaser, UpgradeBox } from "@/components/paywall/UpgradeBox";
import { getParksForActivityLive } from "@/lib/live-parks";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActivities, getActivity, getParksForActivity, getPark, getTrails, isFeatured, isContinental, CONTINENTAL_BOUNDS, parkSearchText } from "@/lib/content";
import { activityHero } from "@/lib/hero";
import { trailMeta } from "@/lib/trail-format";
import { PageHero } from "@/components/hero/PageHero";
import { SplitLayout } from "@/components/explorer/SplitLayout";
import { ExplorerItem, ExplorerSearch } from "@/components/explorer/Explorer";
import { ParkMap } from "@/components/map/ParkMap";
import { getAllCampgrounds, campMeta, shortCampName } from "@/lib/campgrounds";

// Rendered per visitor: the page depends on whether they have TrailsTV+.
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return getActivities().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = getActivity((await params).slug);
  return a ? { title: `${a.name} in National Parks`, description: a.description } : {};
}

const LIVE_LABELS: Record<string, string> = {
  weather: "forecast", alerts: "alerts", air: "air quality", fire: "wildfires", sun: "sunrise/sunset", rivers: "river flow", snow: "snowpack",
  avalanche: "avalanche danger", tides: "tides", campgrounds: "campgrounds", boatLaunches: "boat launches", paddleSpots: "kayak & canoe launches (OpenStreetMap)", climbingClosures: "climbing closures", webcams: "webcams",
};

export default async function ActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const activity = getActivity(slug);
  if (!activity) notFound();
  const parks = await getParksForActivityLive(slug);
  const trails = getTrails().filter((t) => isFeatured(t) && t.activities.includes(slug));
  const mapParks = parks.filter(isContinental);
  // Camping: every campground in every park, kept on TrailsTV.
  const camps = slug === "camping" ? getAllCampgrounds() : [];
  const shortPark = (code: string) => getPark(code)?.name.replace(/ National Parks?( and Preserve)?$/, "") ?? code;

  // TrailsTV+ only: free visitors see the header and a faded preview with an upgrade box.
  const access = await getAccess();
  if (isPaid("activities") && !access.plus) {
    return (
      <>
        <PageHero image={await activityHero(slug, parks)} eyebrow={<Link href="/activities">← All activities</Link>} title={<>{activity.icon} {activity.name}</>} subtitle={activity.description} />
        <div className="container" style={{ marginTop: "1.5rem" }}>
          <Teaser box={<UpgradeBox title={FEATURE_COPY.activities.title} text={`${parks.length} parks offer ${activity.name.toLowerCase()}. ${FEATURE_COPY.activities.text}`} signedIn={Boolean(access.user)} next={`/activities/${slug}`} />}>
            <div className="grid">
              {parks.slice(0, 9).map((p) => (
                <div key={p.code} className="card"><h3>{shortPark(p.code)}</h3><p className="muted small">{p.states.join(", ")} · {activity.name}</p></div>
              ))}
            </div>
          </Teaser>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHero
        image={await activityHero(slug, parks)}
        withSplit
        eyebrow={<><Link href="/activities">← All activities</Link></>}
        title={<>{activity.icon} {activity.name}</>}
        subtitle={activity.description}
      />
      <SplitLayout
        map={
          <ParkMap
            center={[39.5, -98.35]}
            zoom={4}
            bounds={mapParks.length > 1 ? undefined : CONTINENTAL_BOUNDS}
            fitMarkers={mapParks.length > 1}
            height="100%"
            legend={false}
            markers={[
              ...mapParks.map((p) => ({ id: p.code, lat: p.lat, lon: p.lon, kind: "park" as const, label: p.name, href: `/parks/${p.code}?activity=${slug}`, detail: p.states.join(", ") })),
              ...camps.filter((c) => c.lat != null && c.lon != null && mapParks.some((p) => p.code === c.parkCode)).map((c) => ({ id: c.id, groups: [c.parkCode], lat: c.lat!, lon: c.lon!, kind: "campground" as const, label: c.name, href: `/campgrounds/${c.id}`, detail: `${shortPark(c.parkCode)} · ${campMeta(c)}` })),
              ...trails.map((t) => ({ id: t.id, groups: [t.parkCode], lat: t.trailhead.lat, lon: t.trailhead.lon, kind: "trailhead" as const, difficulty: t.difficulty ?? undefined, label: t.name, href: `/trails/${t.id}`, detail: trailMeta(t) })),
            ]}
          />
        }
        head={<><h2>{titleCase(camps.length ? `${camps.length} campgrounds in ${new Set(camps.map((c) => c.parkCode)).size} parks` : `${parks.length} park${parks.length === 1 ? "" : "s"} for ${activity.name}`)}</h2><ExplorerSearch placeholder={camps.length ? "Search campgrounds or parks" : "Search parks"} /></>}
      >
        <div className="split-section">
          <h3>Live Data for {titleCase(activity.name)}</h3>
          <div className="chips" style={{ margin: 0 }}>{activity.conditions.map((c) => <span key={c} className="chip">{LIVE_LABELS[c] ?? c}</span>)}</div>
        </div>
        {camps.length > 0 && (
          <>
            <div className="split-section" style={{ paddingBottom: ".5rem" }}><h3 style={{ margin: 0 }}>⛺ Campgrounds</h3></div>
            {camps.map((c) => (
              <ExplorerItem key={c.id} id={c.id} href={`/campgrounds/${c.id}`} icon="⛺" title={shortCampName(c.name)}
                meta={`${shortPark(c.parkCode)} · ${campMeta(c)}`}
                search={`${c.name} ${shortPark(c.parkCode)} ${getPark(c.parkCode)?.states.join(" ") ?? ""}`} />
            ))}
          </>
        )}
        {camps.length > 0 && <div className="split-section" style={{ paddingBottom: ".5rem" }}><h3 style={{ margin: 0 }}>Parks</h3></div>}
        {parks.map((p) => (
          <ExplorerItem
            key={p.code}
            id={p.code}
            href={`/parks/${p.code}?activity=${slug}`}
            icon={<span style={{ fontSize: ".72rem", fontWeight: 800 }}>{p.states[0]}</span>}
            title={p.name.replace(/ National Parks?( and Preserve)?$/, "")}
            meta={p.tagline || p.states.join(", ")}
            search={parkSearchText(p)}
          />
        ))}
        {!parks.length && <div className="list-empty">No parks tagged for this activity yet.</div>}
        {trails.length > 0 && (
          <>
            <div className="split-section" style={{ paddingBottom: ".5rem" }}><h3 style={{ margin: 0 }}>Routes</h3></div>
            {trails.map((t) => (
              <ExplorerItem key={t.id} id={t.id} href={`/trails/${t.id}`} icon="🥾" title={t.name}
                meta={`${getPark(t.parkCode)?.name.replace(/ National Parks?( and Preserve)?$/, "")} · ${trailMeta(t, { permit: false })}`}
                search={`${t.name} ${t.parkCode}`} />
            ))}
          </>
        )}
      </SplitLayout>
    </>
  );
}
