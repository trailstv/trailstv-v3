import Link from "next/link";
import { forecastDate, forecastPart } from "@/lib/forecast-format";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActivities, getPark, getTrail, getTrails, getTrailsForPark, getTrailLines, isFeatured, isHikingTrail } from "@/lib/content";
import { trailMeta, difficultyLabel, diffIcon } from "@/lib/trail-format";
import { distanceKm } from "@/lib/geo";
import { parkHero } from "@/lib/hero";
import { PageHero } from "@/components/hero/PageHero";
import { SplitLayout } from "@/components/explorer/SplitLayout";
import { ExplorerItem } from "@/components/explorer/Explorer";
import { trailVideoSet } from "@/lib/videos";
import { MediaPane } from "@/components/video/MediaPane";
import { getForecast } from "@/lib/sources/nws";
import { getGauge } from "@/lib/sources/usgs";
import { getFiresNear } from "@/lib/sources/misc";
import { ParkMap } from "@/components/map/ParkMap";
import { Reports } from "@/components/Reports";
import { ReportForm } from "@/components/ReportForm";
import { UserActions } from "@/components/UserActions";
import { WeatherIcon } from "@/components/WeatherIcon";

export const revalidate = 900;

// Featured trails are pre-built; the thousands of imported trails are built on first visit, then cached.
export function generateStaticParams() {
  return getTrails().filter(isFeatured).map((t) => ({ id: t.id }));
}

const USE_CHIPS: Record<string, string> = { hike: "🥾 Hiking", bike: "🚵 Biking", horse: "🐎 Horses", dog: "🐕 Dogs", wheelchair: "♿ Wheelchair", snowshoe: "❄️ Snowshoe", ski: "⛷️ Ski", paddle: "🛶 Paddling" };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const t = getTrail((await params).id);
  return t ? { title: t.name, description: t.summary || `${t.name}: ${t.distanceMi} mi trail in ${getPark(t.parkCode)?.name}.` } : {};
}

export default async function TrailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trail = getTrail(id);
  if (!trail) notFound();
  const park = getPark(trail.parkCode)!;
  const { lat, lon } = trail.trailhead;

  const [forecast, gauge, fires] = await Promise.all([getForecast(lat, lon), trail.usgsSite ? getGauge(trail.usgsSite) : null, getFiresNear(lat, lon, 30)]);
  const activities = getActivities().filter((a) => trail.activities.includes(a.slug));

  // Nearby trails: closest 25 hiking trails in the same park.
  const others = getTrailsForPark(park.code)
    .filter((o) => o.id !== trail.id && isHikingTrail(o))
    .map((o) => ({ o, d: distanceKm(lat, lon, o.trailhead.lat, o.trailhead.lon) }))
    .sort((a, b) => a.d - b.d).slice(0, 25).map(({ o }) => o);
  const routeLines = getTrailLines(trail);
  const subtitle = trail.summary || `${trail.distanceMi} mi${trail.trailType === "snow" ? " snow" : trail.trailType === "water" ? " water" : ""} trail in ${park.name}`;
  const videos = await trailVideoSet(trail.id);

  return (
    <>
      <PageHero
        image={parkHero(park)}
        withSplit
        eyebrow={<><Link href={`/parks/${park.code}`}>← {park.name}</Link></>}
        title={trail.name}
        subtitle={subtitle}
      />

      <SplitLayout
        map={
          <MediaPane videos={videos}>
          <ParkMap
            center={[lat, lon]}
            zoom={14}
            height="100%"
            legend={false}
            parkCode={park.code}
            lines={routeLines}
            lineDifficulty={trail.difficulty ?? undefined}
            markers={[
              { id: trail.id, lat, lon, kind: "trailhead" as const, difficulty: trail.difficulty ?? undefined, label: trail.trailhead.name, detail: `Trailhead · ${trail.name}` },
              ...others.map((o) => ({ id: o.id, lat: o.trailhead.lat, lon: o.trailhead.lon, kind: "trailhead" as const, difficulty: o.difficulty ?? undefined, label: o.name, href: `/trails/${o.id}`, detail: trailMeta(o) })),
            ]}
          />
          </MediaPane>
        }
        head={
          <>
            <span className={`badge ${trail.difficulty ?? ""}`}>{difficultyLabel(trail.difficulty)}</span>
            {trail.closed && <span className="badge hard" style={{ marginLeft: 6 }}>Temporarily closed</span>}
            {trail.seasonal && <span className="badge warn" style={{ marginLeft: 6 }}>Seasonal</span>}
            {trail.permit && <span className="badge warn" style={{ marginLeft: 6 }}>Permit required</span>}
            <div style={{ marginTop: ".6rem" }}><UserActions target={{ kind: "trail", refId: trail.id, name: trail.name, lat, lon, parkCode: park.code }} /></div>
          </>
        }
      >
        <div className="split-section">
          <div className="stats compact">
            <div className="stat"><b>{trail.distanceMi} mi</b><span>Distance</span></div>
            <div className="stat"><b>{trail.gainFt != null ? `${trail.gainFt.toLocaleString()} ft` : "—"}</b><span>Gain</span></div>
            {trail.routeType && <div className="stat"><b>{trail.routeType}</b><span>Route</span></div>}
            {trail.surface && <div className="stat"><b style={{ textTransform: "capitalize" }}>{trail.surface.toLowerCase()}</b><span>Surface</span></div>}
            {trail.trailClass && <div className="stat" title={trail.trailClass}><b>{trail.trailClass.split(":")[1]?.trim() ?? trail.trailClass}</b><span>{trail.trailClass.split(":")[0]}</span></div>}
          </div>
        </div>
        <ExplorerItem id={trail.id} icon="📍" title={trail.trailhead.name} meta="Trailhead · hover to show on map" />
        {(trail.uses?.length ?? 0) > 0 && (
          <div className="split-section">
            <h3>Allowed uses</h3>
            <div className="chips" style={{ margin: 0 }}>{trail.uses!.map((u) => <span key={u} className="chip">{USE_CHIPS[u] ?? u}</span>)}</div>
            {trail.source === "nps" && <p className="small muted" style={{ marginBottom: 0 }}>From NPS trail records. Check posted rules at the trailhead.</p>}
          </div>
        )}
        {trail.permit && (
          <div className="split-section"><h3>Permit</h3><p className="small" style={{ margin: 0 }}>{trail.permit}</p></div>
        )}
        {trail.hazards.length > 0 && (
          <div className="split-section"><h3>Hazards</h3><div className="chips" style={{ margin: 0 }}>{trail.hazards.map((h) => <span key={h} className="chip">⚠️ {h}</span>)}</div></div>
        )}
        <div className="split-section">
          <h3>Download</h3>
          <a className="act" href={`/api/trails/${trail.id}/gpx`}>⬇ GPX file</a>
          <p className="small muted" style={{ marginBottom: 0 }}>Included with TrailsTV+ or the {park.name.replace(/ National Parks?( and Preserve)?$/, "")} park pack · <Link href="/pricing">see plans</Link></p>
        </div>
        {!trail.verified && <div className="split-section"><p className="small muted" style={{ margin: 0 }}>{trail.source === "nps" ? "Route and length from National Park Service trail data. Elevation and difficulty are added as they're measured." : "Trail stats are preliminary and being verified."}</p></div>}
        {others.length > 0 && (
          <>
            <div className="split-section" style={{ paddingBottom: ".5rem" }}><h3 style={{ margin: 0 }}>Nearby trails in {park.name.replace(/ National Parks?( and Preserve)?$/, "")}</h3></div>
            {others.map((o) => (
              <ExplorerItem key={o.id} id={o.id} href={`/trails/${o.id}`} icon={diffIcon(o.difficulty)} title={o.name} meta={trailMeta(o)} />
            ))}
          </>
        )}
      </SplitLayout>

      <div className="container">
      <h2>Trailhead conditions</h2>
      <div className="panel-grid">
        <div className="card panel" style={{ gridColumn: "1 / -1" }}>
          <h3>🌤️ Forecast at trailhead</h3>
          {forecast.ok && forecast.data ? (
            <div className="forecast">
              {forecast.data.periods.slice(0, 8).map((p) => (
                <div key={p.startTime} className={p.isDaytime ? "" : "night"}>
                  <WeatherIcon forecast={p.shortForecast} isDaytime={p.isDaytime} />
                  <div className="fc-date">{forecastDate(p.startTime)}</div>
                      <div className="small muted">{forecastPart(p.name, p.isDaytime)}</div>
                  <b>{p.temperature}°{p.temperatureUnit}</b>
                  <div className="small muted">{p.shortForecast}</div>
                </div>
              ))}
            </div>
          ) : <p className="err">Unavailable: {forecast.error}</p>}
          <div className="src">Source: {forecast.attribution}</div>
        </div>
        <div className="card panel">
          <h3>🔥 Wildfires nearby</h3>
          {fires.ok && fires.data ? (
            fires.data.length ? (
              <ul>{fires.data.map((f) => <li key={f.name}><b>{f.name}</b>: {f.acres ? `${Math.round(f.acres).toLocaleString()} ac` : "size n/a"}{f.containment != null && `, ${f.containment}% contained`}</li>)}</ul>
            ) : <p>No active fire perimeters nearby. ✅</p>
          ) : <p className="err">Unavailable: {fires.error}</p>}
          <div className="src">Source: {fires.attribution}</div>
        </div>
        {gauge && (
          <div className="card panel">
            <h3>🌊 River gauge</h3>
            {gauge.ok && gauge.data?.length ? (
              <ul>{gauge.data.map((g) => <li key={g.parameter}>{g.parameter}: <b>{g.value} {g.unit}</b></li>)}</ul>
            ) : <p className="err">Unavailable: {gauge.error ?? "no data"}</p>}
            <div className="src">Source: {gauge.attribution} · {trail.usgsSite}</div>
          </div>
        )}
      </div>

      <h2>Trip reports</h2>
      <Reports parkCode={park.code} trailId={trail.id} />
      <div style={{ marginTop: "1rem", maxWidth: 560 }}>
        <ReportForm parkCode={park.code} trailId={trail.id} activities={activities.map(({ slug, name }) => ({ slug, name }))} />
      </div>
      </div>
    </>
  );
}
