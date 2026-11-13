import Link from "next/link";
import type { Metadata } from "next";
import { getAllStatusReports, STATUS_TYPES } from "@/lib/park-status";
import { allParkHeroes } from "@/lib/hero";
import { PageHero } from "@/components/hero/PageHero";
import { ConditionPills } from "@/components/conditions/ConditionPills";

export const revalidate = 900;
export const metadata: Metadata = { title: "Current conditions in every national park", description: "Closures, alerts, wildfires, weather warnings, snow, avalanche danger and air quality across all U.S. national parks." };

const time = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" });

export default async function ConditionsIndex() {
  const reports = await getAllStatusReports();
  return (
    <>
      <PageHero random={allParkHeroes()} eyebrow="All parks" title="Current conditions" subtitle="Closures, alerts, fire, weather, snow, avalanche danger and air quality across every national park." />
      <div className="container">
        <ConditionPills active="all" title={false} />
        <div className="cond-grid">
          {reports.map((r) => {
            const t = STATUS_TYPES[r.type];
            return (
              <section key={r.type} className="card cond-card">
                <div className="cond-card-head">
                  <h2><span aria-hidden="true">{t.icon}</span> {t.label}</h2>
                  <span className={`badge${r.parks.length ? (r.parks.some((p) => p.level === "high") ? " hard" : " warn") : ""}`}>{r.ok ? (r.parks.length ? `${r.parks.length} park${r.parks.length === 1 ? "" : "s"}` : "All clear") : "Unavailable"}</span>
                </div>
                {!r.ok ? (
                  <p className="small muted">Couldn&apos;t reach {r.attribution || "the data source"} right now{r.error ? ` (${r.error})` : ""}.</p>
                ) : r.parks.length ? (
                  <ul className="cond-mini">
                    {r.parks.slice(0, 5).map((p) => (
                      <li key={p.code}><span className={`lvl lvl-${p.level}`} aria-hidden="true" /><Link href={`/conditions/${r.type}#${p.code}`}><b>{p.name}</b></Link> <span className="small muted">{p.headline}</span></li>
                    ))}
                  </ul>
                ) : (
                  <p className="small muted">Nothing to report across {r.checked} parks. ✅</p>
                )}
                <div className="cond-card-foot">
                  <span className="src">{r.attribution} · {time(r.fetchedAt)}</span>
                  <Link href={`/conditions/${r.type}`} className="small">See all →</Link>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
