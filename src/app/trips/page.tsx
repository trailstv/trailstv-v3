import type { Metadata } from "next";
import { canUse, FEATURE_COPY } from "@/lib/paywall";
import { UpgradeBox } from "@/components/paywall/UpgradeBox";
import { PageHero } from "@/components/hero/PageHero";
import { allParkHeroes } from "@/lib/hero";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { listTrips, tripDays } from "@/lib/trips";
import { NewTripForm } from "./NewTripForm";

export const metadata: Metadata = { title: "Your trips" };

const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function TripsPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/trips");
  if (!(await canUse("trips"))) {
    const kept = (await listTrips(user.id)).length;
    return (
      <>
        <PageHero random={await allParkHeroes()} eyebrow="Itineraries" title="Your trips" />
        <div className="container" style={{ marginTop: "2rem" }}>
          <UpgradeBox title={FEATURE_COPY.trips.title} text={`${FEATURE_COPY.trips.text}${kept ? ` Your ${kept} trip${kept === 1 ? " is" : "s are"} kept and will be here when you join.` : ""}`} next="/trips" />
        </div>
      </>
    );
  }
  const trips = await listTrips(user.id);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = trips.filter((t) => !t.endDate || t.endDate >= today);
  const past = trips.filter((t) => t.endDate && t.endDate < today);

  const Card = ({ t }: { t: (typeof trips)[number] }) => (
    <Link href={`/trips/${t.id}`} className="card">
      <h3>{t.name}</h3>
      <p className="muted small">
        {t.startDate ? `${fmt(t.startDate)}${t.endDate && t.endDate !== t.startDate ? " – " + fmt(t.endDate) : ""} · ${tripDays(t)} day${tripDays(t) > 1 ? "s" : ""}` : "No dates yet"}
        {" · "}{t.stops} stop{t.stops === 1 ? "" : "s"}{t.isPublic ? " · 🔗 shared" : ""}
      </p>
    </Link>
  );

  return (
    <>
    <PageHero random={await allParkHeroes()} eyebrow="Itineraries" title="Your trips" />
    <div className="container" style={{ marginTop: "1.5rem" }}>
      <p className="muted">Plan multi-day park trips, then send each day&apos;s route to your maps app or calendar.</p>
      <div style={{ maxWidth: 480 }}><NewTripForm /></div>

      <h2>Upcoming & Undated</h2>
      {upcoming.length ? <div className="grid">{upcoming.map((t) => <Card key={t.id} t={t} />)}</div> : <p className="muted">No upcoming trips. Create one above, or use “Add to trip” on any park or trail.</p>}

      {past.length > 0 && (
        <>
          <h2>Past Trips</h2>
          <div className="grid">{past.map((t) => <Card key={t.id} t={t} />)}</div>
        </>
      )}
    </div>
    </>
  );
}
