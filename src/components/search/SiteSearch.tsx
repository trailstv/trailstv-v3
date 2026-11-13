"use client";

import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import type { SearchHit, SearchType } from "@/lib/search";

const LABEL: Record<SearchType, string> = { park: "Parks", activity: "Activities", trail: "Trails", campground: "Campgrounds" };
type Group = { type: SearchType; hits: SearchHit[] };

/**
 * Header search: type to see parks, activities, campgrounds and trails; ↑ ↓ to move,
 * Enter to open, Esc to close. "/" focuses it from anywhere. Enter with nothing
 * highlighted goes to the full results page.
 */
export function SiteSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const flat = groups.flatMap((g) => g.hits);

  // Close on navigation.
  useEffect(() => { setOpen(false); setMobileOpen(false); setQ(""); }, [pathname]);

  // Fetch suggestions (debounced; ignores out-of-order responses).
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setGroups([]); setLoading(false); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const j = (await r.json()) as { groups: Group[] };
        setGroups(j.groups); setActive(-1); setLoading(false);
      } catch { /* aborted */ }
    }, 150);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  // "/" to focus, click outside to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !/input|textarea|select/i.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault(); flushSync(() => setMobileOpen(true)); input.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setMobileOpen(false); } };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, []);

  const go = (href: string) => { setOpen(false); setMobileOpen(false); input.current?.blur(); router.push(href); };
  const all = () => q.trim() && go(`/search?q=${encodeURIComponent(q.trim())}`);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, flat.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (active >= 0 && active < flat.length) go(flat[active].href); else all(); }
    else if (e.key === "Escape") { setOpen(false); setMobileOpen(false); input.current?.blur(); }
  };

  const show = open && q.trim().length >= 2;
  let i = -1;

  return (
    <div className={`site-search${mobileOpen ? " mobile-open" : ""}`} ref={box}>
      <button type="button" className="search-toggle" aria-label="Search" onClick={() => { flushSync(() => setMobileOpen(true)); input.current?.focus(); }}>
        <SearchIcon />
      </button>
      <div className="search-field" role="combobox" aria-expanded={show} aria-haspopup="listbox" aria-owns={listId}>
        <SearchIcon />
        <input
          ref={input}
          type="search"
          value={q}
          placeholder="Search parks, trails, camping…"
          aria-label="Search TrailsTV"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <kbd className="search-kbd" aria-hidden="true">/</kbd>
      </div>

      {show && (
        <div className="search-pop" id={listId} role="listbox">
          {loading && !groups.length && <div className="search-empty">Searching…</div>}
          {!loading && !groups.length && <div className="search-empty">No matches for “{q.trim()}”</div>}
          {groups.map((g) => (
            <div key={g.type} className="search-group" role="group" aria-label={LABEL[g.type]}>
              <div className="search-group-title">{LABEL[g.type]}</div>
              {g.hits.map((h) => {
                i++;
                const idx = i;
                return (
                  <a key={`${h.type}-${h.id}`} id={`${listId}-${idx}`} role="option" aria-selected={active === idx} href={h.href}
                    className={`search-hit${active === idx ? " active" : ""}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={(e) => { e.preventDefault(); go(h.href); }}>
                    <span className="search-hit-icon" aria-hidden="true">{h.icon}</span>
                    <span><b>{h.title}</b><span className="search-hit-sub">{h.subtitle}</span></span>
                  </a>
                );
              })}
            </div>
          ))}
          {groups.length > 0 && (
            <a href={`/search?q=${encodeURIComponent(q.trim())}`} role="option" aria-selected={active === flat.length} id={`${listId}-${flat.length}`}
              className={`search-all${active === flat.length ? " active" : ""}`} onMouseEnter={() => setActive(flat.length)}
              onClick={(e) => { e.preventDefault(); all(); }}>
              See all results for “{q.trim()}” →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  );
}
