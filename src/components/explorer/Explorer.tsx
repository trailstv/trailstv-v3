"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * Links the left-hand map and the right-hand list:
 * - hovering/focusing a list item highlights its pin (or a whole group, e.g. an activity)
 * - clicking a pin highlights and scrolls to the matching list item
 * - the search box filters list items
 */
type Source = "list" | "map";
interface ExplorerState {
  active: string | null;
  source: Source | null;
  setActive: (id: string | null, source: Source) => void;
  query: string;
  setQuery: (q: string) => void;
}

const Ctx = createContext<ExplorerState | null>(null);
export const useExplorer = () => useContext(Ctx);

export function ExplorerProvider({ children }: { children: React.ReactNode }) {
  const [active, setA] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [query, setQuery] = useState("");
  const value = useMemo<ExplorerState>(
    () => ({ active, source, query, setQuery, setActive: (id, src) => { setA(id); setSource(src); } }),
    [active, source, query],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function ExplorerSearch({ placeholder = "Search…" }: { placeholder?: string }) {
  const ex = useExplorer();
  return (
    <input type="search" placeholder={placeholder} aria-label={placeholder} value={ex?.query ?? ""} onChange={(e) => ex?.setQuery(e.target.value)} />
  );
}

/** One row in the right-hand list. `id` matches a map marker id (or group). */
export function ExplorerItem({
  id, href, icon, title, meta, search, onSelect,
}: { id: string; href?: string; icon?: React.ReactNode; title: React.ReactNode; meta?: React.ReactNode; search?: string; onSelect?: () => void }) {
  const ex = useExplorer();
  const ref = useRef<HTMLAnchorElement & HTMLDivElement>(null);
  const isActive = ex?.active === id;

  // A pin was clicked → bring this row into view.
  useEffect(() => {
    if (isActive && ex?.source === "map") ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isActive, ex?.source]);

  const q = ex?.query.trim().toLowerCase();
  if (q && search && !search.toLowerCase().includes(q)) return null;

  const props = {
    ref,
    className: `list-item${isActive ? " active" : ""}`,
    onMouseEnter: () => ex?.setActive(id, "list"),
    onFocus: () => ex?.setActive(id, "list"),
    onMouseLeave: () => ex?.source === "list" && ex.setActive(null, "list"),
  };
  const body = (
    <>
      {icon && <span className="li-icon" aria-hidden="true">{icon}</span>}
      <span style={{ minWidth: 0 }}>
        <b>{title}</b>
        {meta && <span className="meta">{meta}</span>}
      </span>
    </>
  );
  if (href) return <Link href={href} {...props}>{body}</Link>;
  // No link: still focusable so keyboard users can highlight the pin.
  return (
    <div {...props} tabIndex={0} role={onSelect ? "button" : undefined} onClick={onSelect}
      onKeyDown={(e) => { if (onSelect && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(); } }}>
      {body}
    </div>
  );
}
