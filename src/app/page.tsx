import { getParks, isContinental, parkCount, CONTINENTAL_BOUNDS, parkSearchText, sortByVisits, visitsLabel, getVisitation } from "@/lib/content";
import { allParkHeroes, getParkHeroes } from "@/lib/hero";
import { PageHero } from "@/components/hero/PageHero";
import { SplitLayout } from "@/components/explorer/SplitLayout";
import { ExplorerItem, ExplorerSearch } from "@/components/explorer/Explorer";
import { ParkMap } from "@/components/map/ParkMap";
import { HomeVideo } from "@/components/home/HomeVideo";
import { TopThrees } from "@/components/home/TopThrees";
import { getTopThrees } from "@/lib/top3";
import { ConditionPills } from "@/components/conditions/ConditionPills";

const short = (name: string) => name.replace(/ National Parks?( and Preserve)?$/, "").replace(/^National Park of /, "");

export default async function Home() {
  const parks = sortByVisits(getParks());
  const year = getVisitation().year;
  const rank = new Map(parks.map((p, i) => [p.code, i + 1]));
  const continental = parks.filter(isContinental);
  const other = parks.filter((p) => !isContinental(p));
  const heroes = await allParkHeroes();
  const heroMap = await getParkHeroes();

  const Item = ({ p }: { p: (typeof parks)[number] }) => (
    <ExplorerItem
      id={p.code}
      href={`/parks/${p.code}`}
      icon={<span style={{ fontSize: ".78rem", fontWeight: 800 }} title={`#${rank.get(p.code)} most visited`}>{rank.get(p.code)}</span>}
      title={short(p.name)}
      meta={[p.states.join(", "), visitsLabel(p.code) && `${visitsLabel(p.code)} visits in ${year}`].filter(Boolean).join(" · ")}
      search={parkSearchText(p)}
    />
  );

  return (
    <>
      <PageHero random={heroes} withSplit eyebrow="TrailsTV" title="Viewing America's national parks" subtitle="Trails, paddling, climbing, snow and live conditions for every national park." />

      <SplitLayout
        map={
          <ParkMap
            center={[39.5, -98.35]}
            zoom={4}
            bounds={CONTINENTAL_BOUNDS}
            height="100%"
            legend={false}
            markers={continental.map((p) => ({
              id: p.code, lat: p.lat, lon: p.lon, kind: "park" as const, label: p.name, href: `/parks/${p.code}`,
              detail: [`#${rank.get(p.code)} most visited`, p.states.join(", "), visitsLabel(p.code) && `${visitsLabel(p.code)} visits`].filter(Boolean).join(" · "),
              blurb: p.tagline || undefined,
              image: heroMap.get(p.code)?.src,
            }))}
          />
        }
        head={<><h2>National parks <span className="muted small">({parkCount(parks)})</span></h2><p className="small muted" style={{ margin: "-.2rem 0 .5rem" }}>Most visited first · {year} NPS figures</p><ExplorerSearch placeholder="Search parks or states" /></>}
      >
        {continental.map((p) => <Item key={p.code} p={p} />)}
        {other.length > 0 && (
          <>
            <div className="split-section" style={{ paddingBottom: ".4rem" }}><h3 style={{ margin: 0 }}>Alaska, Hawaiʻi & territories</h3></div>
            {other.map((p) => <Item key={p.code} p={p} />)}
          </>
        )}
      </SplitLayout>

      <div className="container home-below">
        <ConditionPills />
        <HomeVideo />
        <TopThrees groups={await getTopThrees()} />
      </div>
    </>
  );
}
