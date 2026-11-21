import type { Metadata } from "next";
import { canUse, FEATURE_COPY } from "@/lib/paywall";
import { UpgradeBox } from "@/components/paywall/UpgradeBox";
import { getCampground } from "@/lib/campgrounds";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { dayDate, getTrip, tripDays } from "@/lib/trips";
import { getPark, getTrail } from "@/lib/content";
import { trailMeta } from "@/lib/trail-format";
import { allParkHeroes, parkHero } from "@/lib/hero";
import { PageHero } from "@/components/hero/PageHero";
import { googleRoute } from "@/lib/directions";
import { ParkMap } from "@/components/map/ParkMap";
import type { MarkerKind } from "@/components/map/pins";
import { StopControls, TripSettings, AddCustomStop } from "./TripEditor";

export const metadata: Metadata = { title: "Trip" };

const KIND_ICON: Record<string, MarkerKind> = { park: "park", trail: "trailhead", campground: "campground", custom: "viewpoint" };
const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  const data = await getTrip(id, user?.id ?? null);
  if (!data) notFound();
  const { trip, stops, isOwner } = data;
  // Shared (public) trips stay open to everyone; owners need TrailsTV+ to open their own.
  if (isOwner && !(await canUse("trips"))) {
    return (
      <>
        <PageHero keepCase random={await allParkHeroes()} eyebrow={<Link href="/trips">← Your trips</Link>} title={trip.name} />
        <div className="container" style={{ marginTop: "2rem" }}>
          <UpgradeBox title={FEATURE_COPY.trips.title} text={`${FEATURE_COPY.trips.text} This trip is saved and will open again when you join.`} next={`/trips/${trip.id}`} />
        </div>
      </>
    );
  }
  const days = tripDays(trip);
  const located = stops.filter((s) => s.lat != null && s.lon != null);
  const heroPark = stops.map((s) => (s.parkCode ? getPark(s.parkCode) : undefined)).find(Boolean);

  const stopHref = (s: (typeof stops)[number]) =>
    s.kind === "trail" && s.refId ? `/trails/${s.refId}` : s.kind === "park" && s.refId ? `/parks/${s.refId}` : s.kind === "campground" && s.refId && getCampground(s.refId) ? `/campgrounds/${s.refId}` : null;

  return (
    <>
    <PageHero keepCase
      image={heroPark ? await parkHero(heroPark) : null}
      random={heroPark && await parkHero(heroPark) ? undefined : await allParkHeroes()}
      eyebrow={isOwner ? <Link href="/trips">← Your trips</Link> : "Shared trip"}
      title={trip.name}
      subtitle={`${trip.startDate ? `${fmtDay(trip.startDate)}${trip.endDate && trip.endDate !== trip.startDate ? " – " + fmtDay(trip.endDate) : ""} · ` : ""}${days} day${days > 1 ? "s" : ""} · ${stops.length} stop${stops.length === 1 ? "" : "s"}`}
    />
    <div className="container" style={{ marginTop: "1rem" }}>
      {trip.notes && <p>{trip.notes}</p>}

      <div className="actions">
        {located.length > 0 && googleRoute(located.map((s) => ({ lat: s.lat!, lon: s.lon! }))).map((url, i, all) => (
          <a key={url} className="act" href={url} target="_blank" rel="noopener">🧭 Whole trip in Google Maps{all.length > 1 ? ` (part ${i + 1})` : ""}</a>
        ))}
        {trip.startDate && <a className="act" href={`/api/trips/${trip.id}/ics`}>📅 Add to calendar</a>}
      </div>

      {located.length > 0 && (
        <ParkMap
          center={[located[0].lat!, located[0].lon!]}
          zoom={8}
          line={located.length > 1 ? located.map((s) => [s.lon!, s.lat!] as [number, number]) : undefined}
          markers={located.map((s, i) => ({
            lat: s.lat!, lon: s.lon!, kind: KIND_ICON[s.kind] ?? "viewpoint",
            label: `${i + 1}. ${s.name}`, href: stopHref(s) ?? undefined, detail: `Day ${s.day}${s.time ? " · " + s.time : ""}`,
            difficulty: s.kind === "trail" && s.refId ? getTrail(s.refId)?.difficulty ?? undefined : undefined,
          }))}
          legend={false}
        />
      )}

      {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
        const dayStops = stops.filter((s) => s.day === day);
        const routes = googleRoute(dayStops.filter((s) => s.lat != null).map((s) => ({ lat: s.lat!, lon: s.lon! })));
        const miles = dayStops.reduce((m, s) => m + (s.kind === "trail" && s.refId ? getTrail(s.refId)?.distanceMi ?? 0 : 0), 0);
        const date = dayDate(trip, day);
        return (
          <section key={day}>
            <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
              <span>Day {day}{date && <span className="muted" style={{ fontWeight: 400, fontSize: "1rem" }}> · {fmtDay(date)}</span>}</span>
              <span className="small" style={{ fontWeight: 400 }}>
                {miles > 0 && <span className="muted">{Math.round(miles * 10) / 10} trail mi · </span>}
                {routes.map((url, j) => <a key={url} href={url} target="_blank" rel="noopener">🧭 Day Route{routes.length > 1 ? ` ${j + 1}` : ""} </a>)}
              </span>
            </h2>
            <div className="card">
              {dayStops.length === 0 && <p className="muted small" style={{ margin: 0 }}>Nothing planned yet.</p>}
              {dayStops.map((s, idx) => {
                const href = stopHref(s);
                const trail = s.kind === "trail" && s.refId ? getTrail(s.refId) : undefined;
                return (
                  <div key={s.id} className="stop">
                    <span className="num">{idx + 1}</span>
                    <div>
                      <b>{href ? <Link href={href}>{s.name}</Link> : s.name}</b>
                      <div className="small muted">
                        {s.time && <>{s.time} · </>}
                        {s.kind}
                        {trail && <> · {trailMeta(trail, { permit: false })}{trail.permit ? " · ⚠️ permit" : ""}</>}
                        {s.lat != null && <> · <a href={googleRoute([{ lat: s.lat, lon: s.lon! }])[0]} target="_blank" rel="noopener">directions</a></>}
                      </div>
                      {s.notes && <div className="small">{s.notes}</div>}
                    </div>
                    {isOwner && <StopControls tripId={trip.id} stop={{ id: s.id, day: s.day, time: s.time, notes: s.notes }} days={days} first={idx === 0} last={idx === dayStops.length - 1} />}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {isOwner && (
        <>
          <h2>Add a Custom Stop</h2>
          <p className="muted small">Lodging, a restaurant, a gas stop: anything not in TrailsTV. Parks and trails can be added from their pages with “Add to trip”.</p>
          <AddCustomStop tripId={trip.id} days={days} />
          <h2>Trip Settings</h2>
          <TripSettings trip={{ id: trip.id, name: trip.name, startDate: trip.startDate, endDate: trip.endDate, notes: trip.notes, isPublic: trip.isPublic }} />
        </>
      )}
    </div>
    </>
  );
}
