import type { Metadata } from "next";
import { getParksWithActivities } from "@/lib/live-parks";
import { getActivities, getParks, getParksForActivity, isContinental, CONTINENTAL_BOUNDS } from "@/lib/content";
import { activityHero, allParkHeroes } from "@/lib/hero";
import { PageHero } from "@/components/hero/PageHero";
import { SplitLayout } from "@/components/explorer/SplitLayout";
import { ExplorerItem, ExplorerSearch } from "@/components/explorer/Explorer";
import { ParkMap } from "@/components/map/ParkMap";

export const metadata: Metadata = { title: "Activities" };

export default async function ActivitiesPage() {
  const activities = getActivities();
  const allParks = await getParksWithActivities();
  const parks = allParks.filter(isContinental);
  const hero = activityHero("all", []);

  return (
    <>
      <PageHero image={hero} random={hero ? undefined : allParkHeroes()} withSplit eyebrow="Activities" title="Everything you can do in the National Parks" subtitle="Hover an activity to see where you can do it. Each one shows the live conditions that matter for it." />
      <SplitLayout
        map={
          <ParkMap
            center={[39.5, -98.35]}
            zoom={4}
            bounds={CONTINENTAL_BOUNDS}
            height="100%"
            legend={false}
            markers={parks.map((p) => ({ id: p.code, groups: p.activities, lat: p.lat, lon: p.lon, kind: "park" as const, label: p.name, href: `/parks/${p.code}`, detail: p.states.join(", ") }))}
          />
        }
        head={<><h2>Activities <span className="muted small">({activities.length})</span></h2><ExplorerSearch placeholder="Search activities" /></>}
      >
        {activities.map((a) => {
          const n = allParks.filter((p) => p.activities.includes(a.slug)).length;
          return (
            <ExplorerItem
              key={a.slug}
              id={a.slug}
              href={`/activities/${a.slug}`}
              icon={a.icon}
              title={a.name}
              meta={`${n} park${n === 1 ? "" : "s"} · ${a.season === "all" ? "year-round" : a.season}`}
              search={`${a.name} ${a.description}`}
            />
          );
        })}
      </SplitLayout>
    </>
  );
}
