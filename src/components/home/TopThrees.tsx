"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { TopGroup } from "@/lib/top3";

/**
 * One activity's top 3 parks as cards, picked at random on each visit. The page is pre-built, so the pick happens
 * in the browser; the cards fade in once chosen instead of flashing the first activity.
 */
export function TopThrees({ groups }: { groups: TopGroup[] }) {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    if (groups.length) setSlug((s) => s ?? groups[Math.floor(Math.random() * groups.length)].slug);
  }, [groups]);
  const ready = slug != null;
  const group = groups.find((g) => g.slug === slug) ?? groups[0];
  if (!group) return null;

  return (
    <section className={`top3${ready ? "" : " top3-pending"}`} aria-labelledby="top3-title">
      <div className="top3-head">
        <h2 id="top3-title"><span aria-hidden="true">{group.icon}</span> Top 3 for {group.name.toLowerCase()}</h2>
        <Link href={`/activities/${group.slug}`} className="small">All {group.name.toLowerCase()} parks →</Link>
      </div>

      <ol className="top3-grid">
        {group.picks.map((p) => (
          <li key={p.code}>
            <Link href={p.href} className="top3-card">
              <div className="top3-img">
                {p.image && <Image src={p.image} alt="" fill sizes="(max-width: 760px) 100vw, 400px" />}
                <span className="top3-rank">{p.rank}</span>
              </div>
              <div className="top3-body">
                <h3>{p.name}</h3>
                <span className="muted small">{p.states}</span>
                <p>{p.why}</p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
