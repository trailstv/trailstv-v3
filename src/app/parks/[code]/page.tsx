import Link from "next/link";
import { getParkWithActivities } from "@/lib/live-parks";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActivities, getPark, getParks, getFeaturedTrailsForPark, trailUses } from "@/lib/content";
import { trailMeta, diffIcon } from "@/lib/trail-format";
import { parkHero } from "@/lib/hero";
import { ParkMap } from "@/components/map/ParkMap";
import { Reports } from "@/components/Reports";
import { ReportForm } from "@/components/ReportForm";
import { ActivityChips, LiveConditions } from "./ActivityTabs";
import { BuyButton } from "@/components/BuyButton";
import { UserActions } from "@/components/UserActions";
import { PageHero } from "@/components/hero/PageHero";
import { SplitLayout } from "@/components/explorer/SplitLayout";
import { ExplorerItem } from "@/components/explorer/Explorer";
import { MapLegend } from "@/components/map/MapLegend";
import { getProduct, formatPrice } from "@/lib/products";
import { getCampgroundsForPark, campMeta, shortCampName } from "@/lib/campgrounds";
import { featuredVideoSet } from "@/lib/videos";
import { MediaPane } from "@/components/video/MediaPane";
import { OsmTrailsProvider, TrailUseFilter, OsmTrailList, UseGate } from "@/components/explorer/OsmTrails";

export const revalidate = 60;

export function generateStaticParams() {
  return getParks().map((p) => ({ code: p.code }));
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const park = getPark((await params).code);
  return park ? { title: park.name, description: park.tagline || `${park.name}: trails, activities and live conditions.` } : {};
}


export default async function ParkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // Activity list from the import, or live from the NPS API if this park isn't imported yet.
  const park = await getParkWithActivities(code);
  if (!park) notFound();

  const trails = getFeaturedTrailsForPark(park.code);
  const camps = getCampgroundsForPark(park.code);
  const campPins = camps.filter((c) => c.lat != null && c.lon != null);
  const activities = getActivities().filter((a) => park.activities.includes(a.slug));
  const chipData = activities.map(({ slug, name, icon }) => ({ slug, name, icon }));
  const shortName = park.name.replace(/ National Parks?( and Preserve)?$/, "");
  const videos = await featuredVideoSet(park.code, park.activities);

  return (
    <>
      <PageHero
        image={parkHero(park)}
        withSplit
        eyebrow={<><Link href="/parks">← All parks</Link> · {park.states.join(", ")}</>}
        title={park.name}
        subtitle={park.tagline || undefined}
      />

      <OsmTrailsProvider parkCode={park.code}>
      <SplitLayout
        map={
          <MediaPane videos={videos}>
          <ParkMap
            center={[park.lat, park.lon]}
            zoom={trails.length ? 10 : 9}
            fitMarkers={trails.length + campPins.length > 1}
            height="100%"
            legend={false}
            parkCode={park.code}
            markers={[
              ...trails.map((t) => ({
                id: t.id, uses: trailUses(t), lat: t.trailhead.lat, lon: t.trailhead.lon, kind: "trailhead" as const, difficulty: t.difficulty ?? undefined,
                label: t.name, href: `/trails/${t.id}`, detail: trailMeta(t),
              })),
              ...campPins.map((c) => ({ id: c.id, groups: ["camping"], lat: c.lat!, lon: c.lon!, kind: "campground" as const, label: c.name, href: `/campgrounds/${c.id}`, detail: campMeta(c) })),
            ]}
          />
          </MediaPane>
        }
        head={<UserActions target={{ kind: "park", refId: park.code, name: park.name, lat: park.lat, lon: park.lon, parkCode: park.code }} />}
      >
        <div className="split-section">
          <h3>Activities</h3>
          {chipData.length ? <ActivityChips activities={chipData} /> : <p className="small muted" style={{ margin: 0 }}>Activities for this park are coming soon.</p>}
        </div>

        {camps.length > 0 && (
          <>
            <div className="split-section" style={{ paddingBottom: ".5rem" }}>
              <h3 style={{ margin: 0 }}>⛺ Campgrounds <span className="small muted">({camps.length})</span></h3>
            </div>
            {camps.map((c) => <ExplorerItem key={c.id} id={c.id} href={`/campgrounds/${c.id}`} icon="⛺" title={shortCampName(c.name)} meta={campMeta(c)} />)}
          </>
        )}

        <div className="split-section">
          <h3>Trail use</h3>
          <TrailUseFilter />
        </div>

        {trails.length > 0 && (
          <>
            <div className="split-section" style={{ paddingBottom: ".5rem" }}>
              <h3 style={{ margin: 0 }}>Featured trails</h3>
            </div>
            {trails.map((t) => (
              <UseGate key={t.id} uses={trailUses(t)}>
                <ExplorerItem
                  id={t.id}
                  href={`/trails/${t.id}`}
                  icon={diffIcon(t.difficulty)}
                  title={t.name}
                  meta={trailMeta(t)}
                />
              </UseGate>
            ))}
          </>
        )}

        <div className="split-section" style={{ paddingBottom: ".5rem" }}>
          <h3 style={{ margin: 0 }}>All hiking trails</h3>
        </div>
        <OsmTrailList />

        {park.highlights.length > 0 && (
          <div className="split-section">
            <h3>Highlights</h3>
            <div className="chips" style={{ margin: 0 }}>{park.highlights.map((h) => <span key={h} className="chip">{h}</span>)}</div>
          </div>
        )}

        <div className="split-section">
          <h3>Map layers</h3>
          <MapLegend />
        </div>

        <div className="split-section">
          <h3>📦 Take it offline</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Trails, trailheads and GPX for {shortName}, yours to keep. Included with TrailsTV+.</p>
          <BuyButton product="park-pack" parkCode={park.code}>Buy pack · {formatPrice(getProduct("park-pack")!)}</BuyButton>{" "}
          <a href={`/api/parks/${park.code}/pack`} className="small">Already own it?</a>
        </div>
      </SplitLayout>
      </OsmTrailsProvider>

      <div className="container">
        <LiveConditions parkCode={park.code} timeZone={park.timeZone} activities={chipData} />

        <h2>Trip reports</h2>
        <Reports parkCode={park.code} />
        <div style={{ marginTop: "1rem", maxWidth: 560 }}>
          <ReportForm parkCode={park.code} activities={(activities.length ? activities : getActivities().filter((a) => a.slug === "hiking")).map(({ slug, name }) => ({ slug, name }))} />
        </div>
      </div>
    </>
  );
}
