"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Directions } from "./Directions";

type Kind = "park" | "trail" | "campground";
interface State { favorite: boolean; saved: boolean; completions: { id: string; completedOn: string }[]; visitedViaTrail?: string }
interface TripSummary { id: string; name: string; startDate: string | null; endDate: string | null; stops: number }

export interface ActionTarget { kind: Kind; refId: string; name: string; lat: number; lon: number; parkCode: string }

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const daysIn = (t: TripSummary) => (t.startDate && t.endDate ? Math.round((Date.parse(t.endDate) - Date.parse(t.startDate)) / 86400000) + 1 : 1);

/** ♥ Favorite · 🔖 Save · ✓ Completed/Visited · ➕ Add to trip · 🧭 Directions */
export function UserActions({ target }: { target: ActionTarget }) {
  const { data: session, isPending } = useSession();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doneDialog = useRef<HTMLDialogElement>(null);
  const tripDialog = useRef<HTMLDialogElement>(null);
  const key = `${target.kind}:${target.refId}`;
  const signedIn = Boolean(session?.user);

  const load = useCallback(async () => {
    const r = await fetch(`/api/me/items?refs=${encodeURIComponent(key)}`);
    if (r.ok) setState((await r.json()).data[key]);
  }, [key]);

  useEffect(() => { if (signedIn) load(); }, [signedIn, load]);

  const needLogin = () => { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`; };

  async function toggle(field: "favorite" | "saved") {
    if (!signedIn) return needLogin();
    const value = !state?.[field];
    setState((s) => ({ ...(s ?? { favorite: false, saved: false, completions: [] }), [field]: value })); // optimistic
    const r = await fetch("/api/me/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: target.kind, refId: target.refId, field, value }) });
    if (!r.ok) { setError("Couldn't save. Try again."); load(); }
  }

  async function complete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/me/completions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: target.kind, refId: target.refId, completedOn: f.get("completedOn"), notes: f.get("notes") || undefined }),
    });
    if (!r.ok) return setError("Couldn't save. Try again.");
    doneDialog.current?.close();
    load();
  }

  async function undo(id: string) {
    await fetch(`/api/me/completions?id=${id}`, { method: "DELETE" });
    load();
  }

  const done = state?.completions ?? [];
  const isDone = done.length > 0 || Boolean(state?.visitedViaTrail);
  const verb = target.kind === "park" ? "Visited" : target.kind === "campground" ? "Stayed" : "Completed";

  return (
    <div className="actions">
      <button type="button" className={`act fav ${state?.favorite ? "on" : ""}`} onClick={() => toggle("favorite")} aria-pressed={state?.favorite ?? false}>
        {state?.favorite ? "♥" : "♡"} Favorite
      </button>
      <button type="button" className={`act ${state?.saved ? "on" : ""}`} onClick={() => toggle("saved")} aria-pressed={state?.saved ?? false}>
        🔖 {state?.saved ? "Saved" : "Save"}
      </button>
      <button type="button" className={`act ${isDone ? "on" : ""}`} onClick={() => (signedIn ? doneDialog.current?.showModal() : needLogin())}>
        ✓ {isDone ? `${verb}${done.length > 1 ? ` ×${done.length}` : ""}` : `Mark ${verb.toLowerCase()}`}
      </button>
      <button type="button" className="act" onClick={() => (signedIn ? tripDialog.current?.showModal() : needLogin())}>➕ Add to trip</button>
      <Directions place={{ lat: target.lat, lon: target.lon, name: target.name }} />
      {!isPending && !signedIn && <span className="small muted" style={{ alignSelf: "center" }}>Sign in to save</span>}
      {error && <span className="small" style={{ color: "var(--danger)" }}>{error}</span>}

      <dialog ref={doneDialog} className="sheet">
        <h3>{verb} {target.name}</h3>
        {state?.visitedViaTrail && !done.length && <p className="small muted">Already counted as visited: you completed a trail here on {fmt(state.visitedViaTrail)}.</p>}
        {done.length > 0 && (
          <ul className="small">
            {done.map((c) => <li key={c.id}>{fmt(c.completedOn)} <button type="button" className="linkish" onClick={() => undo(c.id)}>remove</button></li>)}
          </ul>
        )}
        <form className="report" onSubmit={complete}>
          <label className="small">Date <input type="date" name="completedOn" defaultValue={today()} max={today()} required /></label>
          <textarea name="notes" rows={2} placeholder="Notes (optional, private)" maxLength={2000} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit">Log {verb.toLowerCase()}</button>
            <button type="button" className="btn-outline" onClick={() => doneDialog.current?.close()}>Close</button>
          </div>
        </form>
      </dialog>

      <dialog ref={tripDialog} className="sheet">
        {signedIn && <AddToTrip target={target} onDone={() => tripDialog.current?.close()} />}
      </dialog>
    </div>
  );
}

function AddToTrip({ target, onDone }: { target: ActionTarget; onDone: () => void }) {
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [tripId, setTripId] = useState<string>("new");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/trips").then((r) => r.json()).then((j) => {
      setTrips(j.data ?? []);
      if (j.data?.[0]) setTripId(j.data[0].id);
    });
  }, []);

  const selected = trips?.find((t) => t.id === tripId);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let id = tripId;
    if (id === "new") {
      const r = await fetch("/api/trips", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: f.get("name"), startDate: f.get("startDate") || null, endDate: f.get("endDate") || f.get("startDate") || null }),
      });
      const j = await r.json();
      if (!r.ok) return setMsg(j.error ?? "Couldn't create trip");
      id = j.data.id;
    }
    const r = await fetch(`/api/trips/${id}/stops`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: target.kind, refId: target.refId, day: Number(f.get("day") ?? 1), time: f.get("time") || null }),
    });
    if (!r.ok) return setMsg("Couldn't add stop");
    setMsg(null);
    onDone();
    window.location.href = `/trips/${id}`;
  }

  if (!trips) return <p className="muted">Loading your trips…</p>;
  return (
    <form className="report" onSubmit={submit}>
      <h3>Add {target.name} to a trip</h3>
      <select value={tripId} onChange={(e) => setTripId(e.target.value)}>
        {trips.map((t) => <option key={t.id} value={t.id}>{t.name}{t.startDate ? ` (${fmt(t.startDate)})` : ""}</option>)}
        <option value="new">+ New trip…</option>
      </select>
      {tripId === "new" ? (
        <>
          <input name="name" required maxLength={120} placeholder="Trip name" defaultValue={`${target.name.replace(" National Park", "")} trip`} />
          <label className="small">Start <input type="date" name="startDate" /></label>
          <label className="small">End <input type="date" name="endDate" /></label>
        </>
      ) : (
        <select name="day" defaultValue="1">
          {Array.from({ length: selected ? daysIn(selected) : 1 }, (_, i) => <option key={i} value={i + 1}>Day {i + 1}</option>)}
        </select>
      )}
      <input name="time" placeholder="Time (optional), e.g. 7:00 AM or Sunrise" maxLength={40} />
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit">Add to trip</button>
        <button type="button" className="btn-outline" onClick={onDone}>Cancel</button>
      </div>
      {msg && <p className="small" style={{ color: "var(--danger)" }}>{msg}</p>}
    </form>
  );
}
