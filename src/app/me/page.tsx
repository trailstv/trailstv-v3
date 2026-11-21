import type { Metadata } from "next";
import { canUse, FEATURE_COPY } from "@/lib/paywall";
import { Teaser, UpgradeBox } from "@/components/paywall/UpgradeBox";
import { SignOutButton } from "@/components/SignOutButton";
import { getCampground } from "@/lib/campgrounds";
import { PageHero } from "@/components/hero/PageHero";
import { allParkHeroes } from "@/lib/hero";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getDashboard } from "@/lib/user-data";
import { getParks, getTrail } from "@/lib/content";
import { trailMeta } from "@/lib/trail-format";
import { ParkMap, type MapMarker } from "@/components/map/ParkMap";
import type { UserItem } from "@/lib/db/schema";

export const metadata: Metadata = { title: "My Parks" };

const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const itemHref = (i: UserItem) => (i.kind === "trail" ? `/trails/${i.refId}` : i.kind === "park" ? `/parks/${i.refId}` : i.kind === "campground" && getCampground(i.refId) ? `/campgrounds/${i.refId}` : `/parks/${i.parkCode}`);

function ItemGrid({ items, empty }: { items: UserItem[]; empty: string }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <div className="grid">
      {items.map((i) => {
        const t = i.kind === "trail" ? getTrail(i.refId) : undefined;
        return (
          <Link key={`${i.kind}:${i.refId}`} href={itemHref(i)} className="card">
            <span className="badge">{i.kind}</span>
            <h3 style={{ marginTop: 6 }}>{i.name}</h3>
            {t && <p className="muted small">{trailMeta(t)}</p>}
          </Link>
        );
      })}
    </div>
  );
}

export default async function MePage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/me");
  const d = await getDashboard(user.id);
  if (!d) return <div className="container"><div className="notice warn">Connect Neon (DATABASE_URL).</div></div>;

  const visited = new Set(d.visitedParks.map((v) => v.park.code));
  const saved = new Set(d.saved.filter((s) => s.kind === "park").map((s) => s.refId));
  // Map: visited parks in green, saved parks in amber, everything else hidden.
  const markers: MapMarker[] = getParks()
    .filter((p) => visited.has(p.code) || saved.has(p.code))
    .map((p) => ({ lat: p.lat, lon: p.lon, kind: visited.has(p.code) ? "park" : "viewpoint", label: p.name, href: `/parks/${p.code}`, detail: visited.has(p.code) ? "Visited ✓" : "Saved: want to go" }));
  const pct = Math.round((d.stats.parksVisited / Math.max(d.stats.parksTotal, 1)) * 100);
  const trailLog = d.completions.filter((c) => c.kind === "trail");
  const unlocked = await canUse("saving");

  return (
    <>
    <PageHero random={await allParkHeroes()} eyebrow={user.name} title="My Parks" />
    <div className="container" style={{ marginTop: "1rem" }}>
      <div className="profile-bar">
        <div>
          <b>{user.name}</b>
          <div className="small muted">{user.email}{user.role === "admin" && <> · <Link href="/admin">Admin</Link></>}</div>
        </div>
        <div className="profile-actions">
          <Link href="/account" className="btn-outline">Billing & downloads</Link>
          <SignOutButton />
        </div>
      </div>

      {!unlocked && (
        <Teaser box={<UpgradeBox title={FEATURE_COPY.saving.title} text={`${FEATURE_COPY.saving.text}${d.favorites.length + d.saved.length + d.trips.length ? " Everything you saved before is kept and comes back when you join." : ""}`} next="/me" />}>
          <div className="stat-row" style={{ marginTop: "1rem" }}>
            {["parks visited", "trails completed", "trail miles", "feet climbed", "trips planned"].map((l) => <div key={l} className="card"><b>–</b><span className="small muted">{l}</span></div>)}
          </div>
          <h2>♥ Favorites</h2>
          <div className="grid">{["Zion", "Yosemite", "Glacier"].map((n) => <div key={n} className="card"><h3>{n}</h3><p className="muted small">Saved park</p></div>)}</div>
          <h2>🔖 Saved: Want to Go</h2>
          <div className="grid">{["Angels Landing", "Mist Trail", "Highline Trail"].map((n) => <div key={n} className="card"><h3>{n}</h3><p className="muted small">Saved trail</p></div>)}</div>
        </Teaser>
      )}
      {unlocked && <>
      <div className="stat-row" style={{ marginTop: "1rem" }}>
        <div className="card"><b>{d.stats.parksVisited}</b><span className="small muted">parks visited</span></div>
        <div className="card"><b>{d.stats.trailsCompleted}</b><span className="small muted">trails completed</span></div>
        <div className="card"><b>{d.stats.miles}</b><span className="small muted">trail miles</span></div>
        <div className="card"><b>{d.stats.elevationFt.toLocaleString()}</b><span className="small muted">feet climbed</span></div>
        <div className="card"><b>{d.trips.length}</b><span className="small muted">trips planned</span></div>
      </div>
      <p className="small muted" style={{ marginTop: "1rem" }}>{d.stats.parksVisited} of {d.stats.parksTotal} parks ({pct}%)</p>
      <div className="progress"><div style={{ width: `${pct}%` }} /></div>

      {markers.length > 0 && (
        <>
          <h2>Your Map</h2>
          <ParkMap center={[39.5, -98.35]} zoom={4} markers={markers} legend={false} height={380} />
          <p className="small muted">🌲 visited · 👁 saved</p>
        </>
      )}

      <h2>♥ Favorites</h2>
      <ItemGrid items={d.favorites} empty="Tap ♡ Favorite on any park or trail you love." />

      <h2>🔖 Saved: Want to Go</h2>
      <ItemGrid items={d.saved} empty="Tap 🔖 Save on parks and trails you want to visit." />

      <h2>🗺️ Trips</h2>
      {d.trips.length ? (
        <div className="grid">{d.trips.slice(0, 6).map((t) => (
          <Link key={t.id} href={`/trips/${t.id}`} className="card"><h3>{t.name}</h3><p className="muted small">{t.startDate ? fmt(t.startDate) : "No dates yet"}</p></Link>
        ))}</div>
      ) : <p className="muted">No trips yet. <Link href="/trips">Plan one →</Link></p>}

      <h2>✓ Parks Visited</h2>
      {d.visitedParks.length ? (
        <div className="chips">{d.visitedParks.map((v) => <Link key={v.park.code} href={`/parks/${v.park.code}`} className="chip">{v.park.name.replace(" National Park", "")} · {fmt(v.firstVisit)}</Link>)}</div>
      ) : <p className="muted">Mark a park visited, or complete one of its trails.</p>}

      <h2>✓ Completed Trails</h2>
      {trailLog.length ? (
        <div className="card">
          {trailLog.map((c) => {
            const t = getTrail(c.refId);
            return (
              <div key={c.id} className="stop" style={{ gridTemplateColumns: "1fr auto" }}>
                <div><b>{t ? <Link href={`/trails/${t.id}`}>{t.name}</Link> : c.refId}</b>{c.notes && <div className="small muted">{c.notes}</div>}</div>
                <span className="small muted">{fmt(c.completedOn)}{t ? ` · ${t.distanceMi} mi` : ""}</span>
              </div>
            );
          })}
        </div>
      ) : <p className="muted">Log a hike with “Mark completed” on any trail.</p>}
      </>}
    </div>
    </>
  );
}
