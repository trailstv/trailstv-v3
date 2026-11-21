import Link from "next/link";
import { forecastDate, forecastPart } from "@/lib/forecast-format";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPark, getTrailsForPark, isHikingTrail } from "@/lib/content";
import { getAllCampgrounds, getCampground, getCampgroundsForPark, getCampsites, amenity, bookingLabel, campMeta, closedNow, priceRange, reserveUrl, shortCampName } from "@/lib/campgrounds";
import type { Campground } from "@/lib/campgrounds";
import { trailMeta, diffIcon } from "@/lib/trail-format";
import { distanceKm } from "@/lib/geo";
import { parkHero } from "@/lib/hero";
import { getForecast } from "@/lib/sources/nws";
import { getFiresNear } from "@/lib/sources/misc";
import { PageHero } from "@/components/hero/PageHero";
import { SplitLayout } from "@/components/explorer/SplitLayout";
import { ExplorerItem } from "@/components/explorer/Explorer";
import { ParkMap } from "@/components/map/ParkMap";
import { UserActions } from "@/components/UserActions";
import { WeatherIcon } from "@/components/WeatherIcon";
import { CampsiteTable } from "@/components/camping/CampsiteTable";

export const revalidate = 900;

export function generateStaticParams() {
  return getAllCampgrounds().map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const c = getCampground((await params).id);
  if (!c) return {};
  const park = getPark(c.parkCode);
  return { title: `${c.name} · ${park?.name ?? ""}`, description: c.description.slice(0, 160) || `${c.name} in ${park?.name}: sites, fees, amenities and season.` };
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const fmtDate = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const fmtPhone = (p: string) => (/^\d{10}$/.test(p) ? `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}` : p);

function Paras({ text }: { text: string }) {
  return <>{text.split(/\n{2,}|\n/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</>;
}

/** Amenity rows: ✓ / ✕ with the seasonal note. */
function amenityRows(c: Campground): [string, string, ReturnType<typeof amenity>][] {
  const a = c.amenities;
  return ([
    ["🚻", "Toilets", a.toilets], ["🚿", "Showers", a.showers], ["🚰", "Drinking water", a.potableWater], ["🗑️", "Trash / recycling", a.trash],
    ["🧺", "Laundry", a.laundry], ["🏪", "Camp store", a.campStore], ["🪵", "Firewood for sale", a.firewood], ["🧊", "Ice for sale", a.ice],
    ["🐻", "Food storage lockers", a.foodStorage], ["🚐", "Dump station", a.dumpStation], ["🎭", "Amphitheater", a.amphitheater],
    ["🙋", "Camp host", a.host], ["📶", "Cell reception", a.cellReception], ["🌐", "Internet", a.internet],
  ] as [string, string, string | string[]][]).map(([icon, label, v]) => [icon, label, amenity(v)] as [string, string, ReturnType<typeof amenity>]).filter(([, , v]) => v);
}

export default async function CampgroundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const camp = getCampground(id);
  if (!camp) notFound();
  const park = getPark(camp.parkCode)!;
  const shortPark = park.name.replace(/ National Parks?( and Preserve)?$/, "");
  const lat = camp.lat ?? park.lat, lon = camp.lon ?? park.lon;

  const [forecast, fires] = await Promise.all([getForecast(lat, lon), getFiresNear(lat, lon, 30)]);
  const sites = getCampsites(camp.id);
  const sitePins = sites.filter((s) => s.lat != null && s.lon != null);
  const others = getCampgroundsForPark(park.code).filter((o) => o.id !== camp.id);
  const nearTrails = camp.lat == null ? [] : getTrailsForPark(park.code)
    .filter(isHikingTrail)
    .map((t) => ({ t, d: distanceKm(lat, lon, t.trailhead.lat, t.trailhead.lon) }))
    .filter(({ d }) => d < 8).sort((a, b) => a.d - b.d).slice(0, 12).map(({ t }) => t);
  const closed = closedNow(camp);
  const reserve = reserveUrl(camp);
  const price = priceRange(camp);
  const amenities = amenityRows(camp);
  const s = camp.sites;
  const siteTypes = ([["Tent only", s.tentOnly], ["RV only", s.rvOnly], ["Electric hookups", s.electrical], ["Group", s.group], ["Horse", s.horse], ["Walk-in / boat-in", s.walkBoatTo]] as [string, number][]).filter(([, n]) => n > 0);
  // Your own park photo first; NPS campground photos are often small.
  const hero = await parkHero(park) ?? (camp.photos[0] ? { src: camp.photos[0].url, credit: camp.photos[0].credit } : null);

  return (
    <>
      <PageHero
        image={hero}
        withSplit
        eyebrow={<><Link href={`/parks/${park.code}?activity=camping`}>← {park.name}</Link> · <Link href="/activities/camping">Camping</Link></>}
        title={camp.name}
        subtitle={campMeta(camp)}
      />

      <SplitLayout
        map={
          <ParkMap
            center={[lat, lon]}
            zoom={sitePins.length ? 16 : 13}
            fitMarkers={sitePins.length > 1}
            height="100%"
            legend={false}
            parkCode={park.code}
            markers={[
              ...(camp.lat != null ? [{ id: camp.id, lat, lon, kind: "campground" as const, label: camp.name, detail: campMeta(camp) }] : []),
              ...sitePins.map((x) => ({ id: `site-${x.id}`, lat: x.lat!, lon: x.lon!, kind: "campground" as const, label: `Site ${x.name}`, detail: [x.loop, x.type.toLowerCase(), x.maxLength ? `${x.maxLength} ft` : null, x.hookups.join(", ")].filter(Boolean).join(" · ") })),
              ...nearTrails.map((t) => ({ id: t.id, lat: t.trailhead.lat, lon: t.trailhead.lon, kind: "trailhead" as const, difficulty: t.difficulty ?? undefined, label: t.name, href: `/trails/${t.id}`, detail: trailMeta(t) })),
            ]}
          />
        }
        head={
          <>
            <div className="chips" style={{ margin: 0 }}>
              <span className="badge">{bookingLabel(camp)}</span>
              {price && <span className="badge warn">{price} / night</span>}
              {closed && <span className="badge hard">Closed now: {closed}</span>}
            </div>
            <div className="reserve">
              {reserve ? (
                <>
                  <a className="btn-reserve" href={reserve} target="_blank" rel="noopener">Reserve a site ↗</a>
                  <span className="small muted">Booking and payment are handled by Recreation.gov.</span>
                </>
              ) : (
                <span className="small"><b>No reservations.</b> Sites are first come, first served, so arrive early.</span>
              )}
            </div>
            <div style={{ marginTop: ".6rem" }}><UserActions target={{ kind: "campground", refId: camp.id, name: camp.name, lat, lon, parkCode: park.code }} /></div>
          </>
        }
      >
        <div className="split-section">
          <div className="stats compact">
            <div className="stat"><b>{s.total || "—"}</b><span>Sites</span></div>
            {camp.sitesReservable > 0 && <div className="stat"><b>{camp.sitesReservable}</b><span>Reservable</span></div>}
            {camp.sitesFirstCome > 0 && <div className="stat"><b>{camp.sitesFirstCome}</b><span>First come</span></div>}
            {price && <div className="stat"><b>{price}</b><span>Per night</span></div>}
            {camp.access.rvAllowed != null && <div className="stat"><b>{camp.access.rvAllowed ? (camp.access.rvMaxLength ? `${camp.access.rvMaxLength} ft` : "Yes") : "No"}</b><span>RVs</span></div>}
          </div>
          {siteTypes.length > 0 && <div className="chips" style={{ margin: ".75rem 0 0" }}>{siteTypes.map(([l, n]) => <span key={l} className="chip">{n} {l.toLowerCase()}</span>)}</div>}
        </div>

        {camp.reservationInfo && (
          <div className="split-section"><h3>Reservations</h3><div className="small prose"><Paras text={camp.reservationInfo} /></div></div>
        )}

        {camp.fees.length > 0 && (
          <div className="split-section">
            <h3>Fees</h3>
            <table className="kv fees">
              <tbody>{camp.fees.map((f, i) => <tr key={i}><th>{f.title || "Fee"}{f.description && f.description !== f.title && <div className="small muted">{f.description}</div>}</th><td>{f.cost != null ? (f.cost === 0 ? "Free" : `$${f.cost.toFixed(2)}`) : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        )}

        {camp.seasons.length > 0 && (
          <div className="split-section">
            <h3>Season & Hours</h3>
            {camp.seasons.map((x, i) => {
              const allDay = DAYS.every((d) => x.hours[d] === "All Day");
              return (
                <div key={i} className="small" style={{ marginBottom: ".5rem" }}>
                  {x.name && x.name !== camp.name && <b>{x.name}</b>}
                  {x.description && <p style={{ margin: ".15rem 0" }}>{x.description}</p>}
                  {!allDay && Object.keys(x.hours).length > 0 && <div className="muted">{DAYS.map((d) => `${d.slice(0, 3)} ${x.hours[d] ?? "—"}`).join(" · ")}</div>}
                  {x.exceptions.map((e, j) => <div key={j}>{e.closed ? "⛔" : "🕑"} {e.name}: {fmtDate(e.start)} – {fmtDate(e.end)}</div>)}
                </div>
              );
            })}
          </div>
        )}

        {amenities.length > 0 && (
          <div className="split-section">
            <h3>Amenities</h3>
            <ul className="amenities">
              {amenities.map(([icon, label, v]) => (
                <li key={label} className={v!.yes ? "" : "no"}><span aria-hidden="true">{icon}</span> {label}<span className="small muted">{v!.yes ? (v!.note ? ` · ${v!.note}` : "") : " · none"}</span></li>
              ))}
            </ul>
          </div>
        )}

        <div className="split-section">
          <h3>RVs, Trailers & Access</h3>
          <table className="kv">
            <tbody>
              {camp.access.rvAllowed != null && <tr><th>RVs</th><td>{camp.access.rvAllowed ? `Allowed${camp.access.rvMaxLength ? `, up to ${camp.access.rvMaxLength} ft` : ""}` : "Not allowed"}</td></tr>}
              {camp.access.trailerAllowed != null && <tr><th>Trailers</th><td>{camp.access.trailerAllowed ? `Allowed${camp.access.trailerMaxLength ? `, up to ${camp.access.trailerMaxLength} ft` : ""}` : "Not allowed"}</td></tr>}
              {camp.access.rvInfo && <tr><th>RV notes</th><td>{camp.access.rvInfo}</td></tr>}
              {camp.access.accessRoads.length > 0 && <tr><th>Roads</th><td>{camp.access.accessRoads.join(", ")}</td></tr>}
              {camp.access.classifications.length > 0 && <tr><th>Type</th><td>{camp.access.classifications.join(", ")}</td></tr>}
              {camp.access.fireStovePolicy && <tr><th>Campfires</th><td>{camp.access.fireStovePolicy}</td></tr>}
              {camp.access.wheelchair && <tr><th>Wheelchair</th><td>{camp.access.wheelchair}</td></tr>}
              {camp.access.adaInfo && <tr><th>ADA</th><td>{camp.access.adaInfo}</td></tr>}
              {camp.access.cellPhoneInfo && <tr><th>Cell</th><td>{camp.access.cellPhoneInfo}</td></tr>}
              {camp.access.internetInfo && <tr><th>Internet</th><td>{camp.access.internetInfo}</td></tr>}
              {camp.access.additionalInfo && <tr><th>Also</th><td>{camp.access.additionalInfo}</td></tr>}
            </tbody>
          </table>
        </div>

        {(camp.directions || camp.address) && (
          <div className="split-section">
            <h3>Getting There</h3>
            {camp.address && <p className="small" style={{ marginTop: 0 }}>{[camp.address.line1, camp.address.city, `${camp.address.state} ${camp.address.zip}`.trim()].filter(Boolean).join(", ")}</p>}
            {camp.directions && <div className="small prose"><Paras text={camp.directions} /></div>}
          </div>
        )}

        {(camp.phone || camp.email) && (
          <div className="split-section">
            <h3>Contact</h3>
            <p className="small" style={{ margin: 0 }}>
              {camp.phone && <a href={`tel:${camp.phone.replace(/\D/g, "")}`}>{fmtPhone(camp.phone)}</a>}
              {camp.phone && camp.email && " · "}
              {camp.email && <a href={`mailto:${camp.email}`}>{camp.email}</a>}
            </p>
          </div>
        )}

        {others.length > 0 && (
          <>
            <div className="split-section" style={{ paddingBottom: ".5rem" }}><h3 style={{ margin: 0 }}>Other Campgrounds in {shortPark}</h3></div>
            {others.map((o) => <ExplorerItem key={o.id} id={o.id} href={`/campgrounds/${o.id}`} icon="⛺" title={shortCampName(o.name)} meta={campMeta(o)} />)}
          </>
        )}
      </SplitLayout>

      <div className="container camp-body">
        {camp.description && (
          <section>
            <h2>About {shortCampName(camp.name)}</h2>
            <div className="prose"><Paras text={camp.description} /></div>
          </section>
        )}

        {camp.photos.length > 0 && (
          <section>
            <h2>Photos</h2>
            <div className="camp-photos">
              {camp.photos.map((p, i) => (
                <figure key={i}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.alt} loading="lazy" />
                  {(p.caption || p.credit) && <figcaption className="small muted">{p.caption}{p.credit && <> · {p.credit}</>}</figcaption>}
                </figure>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2>Campsites</h2>
          {sites.length ? (
            <CampsiteTable sites={sites} />
          ) : (
            <p className="muted">Site-by-site details (sizes, hookups, shade) for this campground are coming soon.</p>
          )}
        </section>

        <section>
          <h2>Conditions at Camp</h2>
          <div className="panel-grid">
            <div className="card panel" style={{ gridColumn: "1 / -1" }}>
              <h3>🌤️ Forecast</h3>
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
              <h3>🔥 Wildfires Nearby</h3>
              {fires.ok && fires.data ? (
                fires.data.length ? (
                  <ul>{fires.data.map((f) => <li key={f.name}><b>{f.name}</b>: {f.acres ? `${Math.round(f.acres).toLocaleString()} ac` : "size n/a"}{f.containment != null && `, ${f.containment}% contained`}</li>)}</ul>
                ) : <p>No active fire perimeters nearby. ✅</p>
              ) : <p className="err">Unavailable: {fires.error}</p>}
              <div className="src">Source: {fires.attribution}</div>
            </div>
            {camp.weather && (
              <div className="card panel">
                <h3>🗓️ Typical Weather</h3>
                <p className="small" style={{ margin: 0 }}>{camp.weather}</p>
              </div>
            )}
          </div>
        </section>

        {camp.regulations && (
          <section>
            <h2>Rules</h2>
            <div className="prose small"><Paras text={camp.regulations} /></div>
          </section>
        )}

        {nearTrails.length > 0 && (
          <section>
            <h2>Trails Near Camp</h2>
            <ul className="camp-trails">
              {nearTrails.map((t) => <li key={t.id}><Link href={`/trails/${t.id}`}>{diffIcon(t.difficulty)} {t.name}</Link> <span className="small muted">{trailMeta(t)}</span></li>)}
            </ul>
          </section>
        )}

        <p className="small muted">Campground information from the National Park Service{sites.length ? " and Recreation.gov" : ""}{camp.updated ? `, updated ${fmtDate(camp.updated.slice(0, 10))}` : ""}. Confirm current status with the park before you go.</p>
      </div>
    </>
  );
}
