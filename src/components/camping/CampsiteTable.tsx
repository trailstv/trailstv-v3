"use client";

import { useMemo, useState } from "react";
import type { Campsite } from "@/lib/campground-types";

const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Every campsite with filters: loop, site type, RV length, hookups, accessible, pets. */
export function CampsiteTable({ sites }: { sites: Campsite[] }) {
  const [loop, setLoop] = useState("");
  const [type, setType] = useState("");
  const [length, setLength] = useState(0);
  const [hookups, setHookups] = useState(false);
  const [accessible, setAccessible] = useState(false);
  const [pets, setPets] = useState(false);

  const loops = useMemo(() => [...new Set(sites.map((s) => s.loop).filter(Boolean))], [sites]);
  const types = useMemo(() => [...new Set(sites.map((s) => s.type).filter(Boolean))].sort(), [sites]);
  const shown = sites.filter((s) =>
    (!loop || s.loop === loop) && (!type || s.type === type) && (!length || (s.maxLength ?? 0) >= length) &&
    (!hookups || s.hookups.length > 0) && (!accessible || s.accessible) && (!pets || /^y/i.test(s.pets)));

  return (
    <div className="sites">
      <div className="sites-filters">
        {loops.length > 1 && (
          <label>Loop <select value={loop} onChange={(e) => setLoop(e.target.value)}><option value="">All</option>{loops.map((l) => <option key={l} value={l}>{title(l)}</option>)}</select></label>
        )}
        {types.length > 1 && (
          <label>Site type <select value={type} onChange={(e) => setType(e.target.value)}><option value="">All</option>{types.map((t) => <option key={t} value={t}>{title(t)}</option>)}</select></label>
        )}
        <label>RV / trailer <select value={length} onChange={(e) => setLength(Number(e.target.value))}><option value={0}>Any</option>{[20, 25, 30, 35, 40].map((n) => <option key={n} value={n}>{n} ft +</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={hookups} onChange={(e) => setHookups(e.target.checked)} /> Hookups</label>
        <label className="check"><input type="checkbox" checked={accessible} onChange={(e) => setAccessible(e.target.checked)} /> ♿ Accessible</label>
        <label className="check"><input type="checkbox" checked={pets} onChange={(e) => setPets(e.target.checked)} /> 🐕 Pets</label>
        <span className="small muted">{shown.length} of {sites.length} sites</span>
      </div>

      <div className="sites-scroll">
        <table className="sites-table">
          <thead>
            <tr><th>Site</th><th>Loop</th><th>Type</th><th>People</th><th>RV / trailer</th><th>Hookups</th><th>Driveway</th><th>Shade</th><th>Features</th></tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              return (
                <tr key={s.id}>
                  <td><b>{s.name}</b>{s.accessible && <span title="Accessible" aria-label="Accessible"> ♿</span>}{!s.reservable && <div className="small muted">First come</div>}</td>
                  <td>{title(s.loop)}</td>
                  <td>{title(s.type)}</td>
                  <td>{s.maxPeople ?? "—"}{s.maxVehicles ? <div className="small muted">{s.maxVehicles} vehicle{s.maxVehicles > 1 ? "s" : ""}</div> : null}</td>
                  <td>{s.maxLength ? `${s.maxLength} ft` : s.equipment.some((e) => /rv|trailer|camper/i.test(e.name)) ? "Yes" : s.equipment.length ? "Tent only" : "—"}</td>
                  <td>{s.hookups.join(", ") || "None"}</td>
                  <td className="small">{s.driveway || "—"}</td>
                  <td>{s.shade || "—"}</td>
                  <td className="small">{[...s.features, /^y/i.test(s.pets) ? "Pets OK" : ""].filter(Boolean).join(", ") || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && <p className="muted" style={{ padding: "1rem" }}>No sites match those filters.</p>}
      </div>
    </div>
  );
}
