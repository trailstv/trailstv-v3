import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStatusReport, isStatusType, STATUS_TYPES, type StatusType } from "@/lib/park-status";
import { allParkHeroes } from "@/lib/hero";
import { PageHero } from "@/components/hero/PageHero";
import { SplitLayout } from "@/components/explorer/SplitLayout";
import { ExplorerItem, ExplorerSearch } from "@/components/explorer/Explorer";
import { ParkMap } from "@/components/map/ParkMap";
import { ConditionPills } from "@/components/conditions/ConditionPills";
import { CONTINENTAL_BOUNDS } from "@/lib/content";

export const revalidate = 900;

export function generateStaticParams() {
  return (Object.keys(STATUS_TYPES) as StatusType[]).map((type) => ({ type }));
}

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  if (!isStatusType(type)) return {};
  return { title: `${STATUS_TYPES[type].label} in national parks right now`, description: STATUS_TYPES[type].blurb };
}

const LEVEL_LABEL = { high: "Serious", medium: "Moderate", low: "Minor" } as const;
const time = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" });
const fmtDate = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : d);

export default async function ConditionTypePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!isStatusType(type)) notFound();
  const t = STATUS_TYPES[type];
  const r = await getStatusReport(type);

  return (
    <>
      <PageHero
        random={allParkHeroes()}
        withSplit
        eyebrow={<><Link href="/conditions">← All conditions</Link></>}
        title={<><span aria-hidden="true">{t.icon}</span> {t.label}</>}
        subtitle={t.blurb}
      />
      <SplitLayout
        map={
          <ParkMap
            center={[39.5, -98.35]}
            zoom={4}
            bounds={CONTINENTAL_BOUNDS}
            height="100%"
            legend={false}
            markers={r.parks.map((p) => ({ id: p.code, lat: p.lat, lon: p.lon, kind: "park" as const, label: p.name, href: `#${p.code}`, detail: p.headline }))}
          />
        }
        head={
          <>
            <h2 style={{ marginBottom: ".25rem" }}>{r.ok ? (r.parks.length ? `${r.parks.length} park${r.parks.length === 1 ? "" : "s"} affected` : "All clear") : "Data unavailable"}</h2>
            <p className="small muted" style={{ margin: "0 0 .5rem" }}>Checked {r.checked} parks · updated {time(r.fetchedAt)}</p>
            {r.parks.length > 6 && <ExplorerSearch placeholder="Search parks or states" />}
          </>
        }
      >
        {!r.ok && <div className="split-section"><p className="err">Couldn&apos;t reach {r.attribution || "the data source"} right now{r.error ? ` (${r.error})` : ""}. Try again shortly.</p></div>}
        {r.ok && !r.parks.length && <div className="split-section"><p>No parks have {t.label.toLowerCase()} to report right now. ✅</p></div>}
        {r.parks.map((p) => (
          <ExplorerItem key={p.code} id={p.code} href={`#${p.code}`}
            icon={<span className={`lvl lvl-${p.level}`} title={LEVEL_LABEL[p.level]} />}
            title={p.name} meta={p.headline} search={`${p.name} ${p.states.join(" ")}`} />
        ))}
      </SplitLayout>

      <div className="container">
        <ConditionPills active={type} title={false} />
        {r.parks.length > 0 && (
          <div className="cond-details">
            {r.parks.map((p) => (
              <section key={p.code} id={p.code} className="card cond-park">
                <div className="cond-card-head">
                  <h2><Link href={`/parks/${p.code}`}>{p.name}</Link> <span className="small muted">{p.states.join(", ")}</span></h2>
                  <span className={`badge ${p.level === "high" ? "hard" : p.level === "medium" ? "warn" : ""}`}>{LEVEL_LABEL[p.level]}</span>
                </div>
                <ul className="cond-items">
                  {p.items.map((it, i) => (
                    <li key={i}>
                      <b>{it.title}</b>{it.date && <span className="small muted"> · {fmtDate(it.date)}</span>}
                      {it.detail && <div className="small">{it.detail}</div>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        <p className="src" style={{ marginTop: "1.5rem" }}>Source: {r.attribution}. Conditions change quickly; check with the park before you go.</p>
      </div>
    </>
  );
}
