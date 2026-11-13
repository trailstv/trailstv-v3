import Link from "next/link";
import type { Metadata } from "next";
import { search, SEARCH_TYPE_LABEL, type SearchType } from "@/lib/search";
import { allParkHeroes } from "@/lib/hero";
import { PageHero } from "@/components/hero/PageHero";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

const TYPES: SearchType[] = ["park", "activity", "campground", "trail"];

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const { q = "", type } = await searchParams;
  const term = q.trim().slice(0, 100);
  const only = TYPES.includes(type as SearchType) ? (type as SearchType) : null;
  const hits = term ? search(term, { limit: 300 }) : [];
  const counts = Object.fromEntries(TYPES.map((t) => [t, hits.filter((h) => h.type === t).length])) as Record<SearchType, number>;
  const shown = only ? hits.filter((h) => h.type === only) : hits;
  const qs = (t?: SearchType) => `/search?q=${encodeURIComponent(term)}${t ? `&type=${t}` : ""}`;

  return (
    <>
      <PageHero random={allParkHeroes()} eyebrow="Search" title={term ? `“${term}”` : "Search TrailsTV"} subtitle={term ? `${hits.length === 300 ? "300+" : hits.length} result${hits.length === 1 ? "" : "s"}` : "Parks, activities, campgrounds and trails."} />
      <div className="container search-page">
        <form action="/search" className="search-page-form">
          <input type="search" name="q" defaultValue={term} placeholder="Search parks, trails, camping…" aria-label="Search" autoFocus={!term} />
          <button type="submit" className="btn">Search</button>
        </form>

        {term && (
          <div className="chips">
            <Link href={qs()} className={`chip${!only ? " active" : ""}`}>All <span className="muted">{hits.length}</span></Link>
            {TYPES.filter((t) => counts[t]).map((t) => (
              <Link key={t} href={qs(t)} className={`chip${only === t ? " active" : ""}`}>{SEARCH_TYPE_LABEL[t]} <span className="muted">{counts[t]}</span></Link>
            ))}
          </div>
        )}

        {term && !hits.length && <p className="muted">Nothing matched. Try a park name, a state, an activity like “kayaking”, or a trail name.</p>}

        <ul className="search-results">
          {shown.map((h) => (
            <li key={`${h.type}-${h.id}`}>
              <Link href={h.href} className="search-hit">
                <span className="search-hit-icon" aria-hidden="true">{h.icon}</span>
                <span><b>{h.title}</b><span className="search-hit-sub">{h.subtitle}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
