"use client";

import { useEffect, useState } from "react";
import { forecastDate, forecastPart } from "@/lib/forecast-format";
import type { ConditionKey, SourceResult } from "@/lib/types";
import Link from "next/link";
import { WeatherIcon } from "./WeatherIcon";

type Results = Partial<Record<ConditionKey, SourceResult<any>>>;

const TITLES: Record<ConditionKey, string> = {
  weather: "🌤️ Forecast", alerts: "⚠️ Alerts & closures", air: "💨 Air quality", fire: "🔥 Wildfires nearby",
  sun: "🌅 Sun", rivers: "🌊 River gauges", snow: "❄️ Snowpack (SNOTEL)", avalanche: "🏔️ Avalanche forecast",
  tides: "🌊 Tides", campgrounds: "⛺ Campgrounds", boatLaunches: "⛵ Boat launches",
  climbingClosures: "🧗 Climbing closures", webcams: "📷 Webcams",
};

function Body({ k, d, timeZone }: { k: ConditionKey; d: any; timeZone: string }) {
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone }) : "—");
  switch (k) {
    case "weather":
      return (
        <div className="forecast">
          {d.periods.slice(0, 8).map((p: any) => (
            <div key={p.startTime} className={p.isDaytime ? "" : "night"}>
              <WeatherIcon forecast={p.shortForecast} isDaytime={p.isDaytime} />
              <div className="fc-date">{forecastDate(p.startTime)}</div>
                      <div className="small muted">{forecastPart(p.name, p.isDaytime)}</div>
              <b>{p.temperature}°{p.temperatureUnit}</b>
              <div className="small muted">{p.shortForecast}</div>
              {p.precipChance != null && <div className="small">💧 {p.precipChance}%</div>}
            </div>
          ))}
        </div>
      );
    case "alerts": {
      const all = [...d.weather.map((w: any) => ({ id: w.id, title: w.event, body: w.headline, severe: /Severe|Extreme/.test(w.severity) })),
        ...d.park.map((a: any) => ({ id: a.id, title: a.title, body: a.category, severe: a.category === "Danger" || a.category === "Park Closure" }))];
      if (!all.length) return <p>No active alerts. ✅</p>;
      return <>{all.map((a) => <div key={a.id} className={`alert ${a.severe ? "severe" : ""}`}><b>{a.title}</b><div className="small">{a.body}</div></div>)}</>;
    }
    case "air":
      if (!d.length) return <p className="muted">No nearby monitors.</p>;
      return <ul>{d.map((r: any) => <li key={r.parameter}>{r.parameter}: <b>{r.aqi}</b> ({r.category})</li>)}</ul>;
    case "fire":
      if (!d.length) return <p>No active fire perimeters nearby. ✅</p>;
      return <ul>{d.map((f: any) => <li key={f.name}><b>{f.name}</b> — {f.acres ? `${Math.round(f.acres).toLocaleString()} ac` : "size n/a"}{f.containment != null && `, ${f.containment}% contained`}</li>)}</ul>;
    case "sun":
      return <ul><li>Civil dawn {time(d.civilDawn)}</li><li>Sunrise <b>{time(d.sunrise)}</b></li><li>Sunset <b>{time(d.sunset)}</b></li><li>Civil dusk {time(d.civilDusk)}</li><li>{d.daylightHours} h of daylight</li></ul>;
    case "rivers": {
      if (!d.length) return <p className="muted">No USGS gauges in range.</p>;
      const bySite: Record<string, any[]> = {};
      d.forEach((g: any) => (bySite[g.siteId] ??= []).push(g));
      return <ul>{Object.entries(bySite).slice(0, 8).map(([site, gs]) => (
        <li key={site}>{site}: {gs.map((g) => `${g.value} ${g.unit}`).join(" · ")}</li>
      ))}</ul>;
    }
    case "snow":
      if (!d.length) return <p className="muted">No SNOTEL stations near this park.</p>;
      return <ul>{d.map((s: any) => <li key={s.triplet}><b>{s.name}</b> ({s.elevationFt.toLocaleString()} ft): {s.snowDepthIn ?? "—"}″ depth, {s.sweIn ?? "—"}″ SWE</li>)}</ul>;
    case "avalanche":
      if (!d.length) return <p className="muted">No forecast zones found.</p>;
      return <ul>{d.map((z: any) => <li key={z.zone}>{z.zone}: <b>{z.offSeason ? "Off season" : z.danger}</b>{!z.offSeason && z.travelAdvice && <div className="small muted">{z.travelAdvice}</div>}</li>)}</ul>;
    case "tides":
      return <ul>{d.slice(0, 6).map((t: any) => <li key={t.time}>{t.type === "H" ? "High" : "Low"} {t.time.slice(5)} — {t.heightFt} ft</li>)}</ul>;
    case "campgrounds":
      if (!d.length) return <p className="muted">No campgrounds listed.</p>;
      return <ul className="camp-list">{d.map((c: any) => <li key={c.id}>{c.href ? <Link href={c.href}><b>{c.name}</b></Link> : <b>{c.name}</b>}{c.closed && <span className="badge hard" style={{ marginLeft: 6 }}>Closed</span>}<div className="small muted">{c.meta}</div></li>)}</ul>;
    case "boatLaunches":
      if (!d.length) return <p className="muted">None listed on Recreation.gov.</p>;
      return <ul>{d.slice(0, 10).map((f: any) => <li key={f.id}>{f.name}</li>)}</ul>;
    case "climbingClosures":
      if (!d.length) return <p>No climbing closures posted. ✅</p>;
      return <>{d.map((a: any) => <div key={a.id} className="alert"><b>{a.title}</b></div>)}</>;
    case "webcams":
      if (!d.length) return <p className="muted">No webcams.</p>;
      return (
        <div className="webcams">
          {d.slice(0, 6).map((w: any) => (
            <figure key={w.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {w.images?.[0]?.url && <img src={w.images[0].url} alt={w.images[0].altText || w.title} loading="lazy" />}
              <figcaption className="small">{w.title}{w.isStreaming && " 🔴 live"}</figcaption>
            </figure>
          ))}
        </div>
      );
  }
}

export function ConditionsPanel({ parkCode, activity, timeZone }: { parkCode: string; activity?: string; timeZone: string }) {
  const [data, setData] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = activity ? `?activity=${activity}` : "";
    fetch(`/api/parks/${parkCode}/conditions${qs}`)
      .then((r) => r.json())
      .then((j) => setData(j.data))
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, [parkCode, activity]);

  if (loading) return <p className="muted">Loading live conditions…</p>;
  if (!data) return null;

  return (
    <div className="panel-grid">
      {(Object.entries(data) as [ConditionKey, SourceResult<any>][]).map(([k, r]) => (
        <div key={k} className="card panel" style={k === "weather" ? { gridColumn: "1 / -1" } : undefined}>
          <h3>{TITLES[k]}</h3>
          {r.ok && r.data ? <Body k={k} d={r.data} timeZone={timeZone} /> : <p className="err">Unavailable: {r.error}</p>}
          {r.attribution && <div className="src">Source: {r.attribution}</div>}
        </div>
      ))}
    </div>
  );
}
