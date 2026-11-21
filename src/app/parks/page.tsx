import Link from "next/link";
import { TopRated } from "@/components/home/TopRated";
import { getTopThrees } from "@/lib/top3";
import { getParksWithActivities } from "@/lib/live-parks";
import type { Metadata } from "next";
import { getActivities, getActivity, getParks, isContinental, parkCount, CONTINENTAL_BOUNDS, parkSearchText } from "@/lib/content";
import { activityHero, allParkHeroes } from "@/lib/hero";
import { PageHero } from "@/components/hero/PageHero";
import { SplitLayout } from "@/components/explorer/SplitLayout";
import { ExplorerItem, ExplorerSearch } from "@/components/explorer/Explorer";
import { ParkMap } from "@/components/map/ParkMap";

export const metadata: Metadata = { title: "National Parks" };

export default async function ParksPage({ searchParams }: { searchParams: Promise<{ activity?: string }> }) {
  const { activity } = await searchParams;
  const act = activity ? getActivity(activity) : undefined;
  const parks = (await getParksWithActivities()).filter((p) => !act || p.activities.includes(act.slug));
  const mapParks = parks.filter(isContinental);

  return (
    <>
      <PageHero
        image={act ? await activityHero(act.slug, parks) : null}
        random={act ? undefined : await allParkHeroes()}
        withSplit
        eyebrow="National parks"
        title={act ? <>{act.icon} {act.name}</> : "Every national park"}
        subtitle={act ? `${parks.length} parks for ${act.name.toLowerCase()}` : `${parkCount(parks)} parks, from Acadia to Zion`}
      />
      <SplitLayout
        map={
          <ParkMap
            center={[39.5, -98.35]}
            zoom={4}
            bounds={CONTINENTAL_BOUNDS}
            height="100%"
            legend={false}
            markers={mapParks.map((p) => ({ id: p.code, lat: p.lat, lon: p.lon, kind: "park" as const, label: p.name, href: `/parks/${p.code}${act ? `?activity=${act.slug}` : ""}`, detail: p.states.join(", ") }))}
          />
        }
        head={<><h2>{parkCount(parks)} Parks</h2><ExplorerSearch placeholder="Search parks or states" /></>}
      >
        <div className="split-section">
          <h3>Filter by Activity</h3>
          <div className="chips" style={{ margin: 0 }}>
            <Link href="/parks" className={`chip ${!act ? "active" : ""}`}>All</Link>
            {getActivities().map((a) => (
              <Link key={a.slug} href={`/parks?activity=${a.slug}`} className={`chip ${act?.slug === a.slug ? "active" : ""}`}>{a.icon} {a.name}</Link>
            ))}
          </div>
        </div>
        {parks.map((p) => (
          <ExplorerItem
            key={p.code}
            id={p.code}
            href={`/parks/${p.code}${act ? `?activity=${act.slug}` : ""}`}
            icon={<span style={{ fontSize: ".72rem", fontWeight: 800 }}>{p.states[0]}</span>}
            title={p.name.replace(/ National Parks?( and Preserve)?$/, "")}
            meta={p.tagline || p.states.join(", ")}
            search={parkSearchText(p)}
          />
        ))}
      </SplitLayout>

      <div className="container">
        <TopRated groups={await getTopThrees()} highlight={act?.slug} />
      </div>
    </>
  );
}
