import Link from "next/link";
import Image from "next/image";
import type { TopGroup } from "@/lib/top3";

/**
 * "Top rated" grid: the #1 park for every activity (first pick in content/top3.json),
 * each linking to that park's page with the activity selected.
 */
export function TopRated({ groups, highlight }: { groups: TopGroup[]; highlight?: string }) {
  if (!groups.length) return null;
  return (
    <section className="top-rated" aria-labelledby="top-rated-title">
      <div className="top3-head">
        <h2 id="top-rated-title">Top Rated for Every Activity</h2>
        <Link href="/activities" className="small">All activities →</Link>
      </div>
      <ul className="top-rated-grid">
        {groups.map((g) => {
          const p = g.picks[0];
          return (
            <li key={g.slug} className={highlight === g.slug ? "hl" : undefined}>
              <Link href={p.href} className="top-rated-card">
                <div className="top-rated-img">
                  {p.image && <Image src={p.image} alt="" fill sizes="(max-width: 760px) 100vw, 300px" />}
                  <span className="top-rated-act"><span aria-hidden="true">{g.icon}</span> {g.name}</span>
                </div>
                <div className="top-rated-body">
                  <h3>{p.name}</h3>
                  <span className="muted small">{p.states}</span>
                  <p>{p.why}</p>
                  <span className="top-rated-cta">View {p.name} →</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
