"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Request failed");
  return r.json();
}

/** Move up/down, change day, edit time & notes, remove. */
export function StopControls({ tripId, stop, days, first, last }: {
  tripId: string; stop: { id: string; day: number; time: string | null; notes: string | null }; days: number; first: boolean; last: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = `/api/trips/${tripId}/stops/${stop.id}`;
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); router.refresh(); } finally { setBusy(false); } };

  if (editing) {
    return (
      <form
        className="report"
        style={{ gridColumn: "1 / -1" }}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() => call(url, "PATCH", { time: f.get("time") || null, notes: f.get("notes") || null, day: Number(f.get("day")) })).then(() => setEditing(false));
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <select name="day" defaultValue={stop.day}>{Array.from({ length: days }, (_, i) => <option key={i} value={i + 1}>Day {i + 1}</option>)}</select>
          <input name="time" defaultValue={stop.time ?? ""} placeholder="Time" maxLength={40} style={{ flex: 1 }} />
        </div>
        <textarea name="notes" defaultValue={stop.notes ?? ""} placeholder="Notes" rows={2} maxLength={2000} />
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={busy}>Save</button>
          <button type="button" className="btn-outline" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div className="stop-tools">
      <button type="button" title="Move up" disabled={busy || first} onClick={() => run(() => call(url, "PATCH", { move: "up" }))}>↑</button>
      <button type="button" title="Move down" disabled={busy || last} onClick={() => run(() => call(url, "PATCH", { move: "down" }))}>↓</button>
      <button type="button" title="Edit" onClick={() => setEditing(true)}>✎</button>
      <button type="button" title="Remove" disabled={busy} onClick={() => confirm("Remove this stop?") && run(() => call(url, "DELETE"))}>✕</button>
    </div>
  );
}

/** Accepts "36.05, -112.14" or a Google Maps URL containing "@lat,lon". */
function parseCoords(s: string): { lat: number; lon: number } | null {
  const m = s.match(/@?(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

export function AddCustomStop({ tripId, days }: { tripId: string; days: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="report card"
      style={{ maxWidth: 520 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const raw = String(f.get("coords") ?? "").trim();
        const coords = raw ? parseCoords(raw) : null;
        if (raw && !coords) return setError("Couldn't read those coordinates. Try “44.42, -110.58”.");
        try {
          await call(`/api/trips/${tripId}/stops`, "POST", { kind: "custom", name: f.get("name"), day: Number(f.get("day")), time: f.get("time") || null, notes: f.get("notes") || null, ...coords });
          form.reset(); setError(null); router.refresh();
        } catch (err) { setError((err as Error).message); }
      }}
    >
      <input name="name" required maxLength={140} placeholder="Name, e.g. Old Faithful Inn" />
      <input name="coords" placeholder="Location (optional): “lat, lon” or a Google Maps link" />
      <div style={{ display: "flex", gap: 8 }}>
        <select name="day">{Array.from({ length: days }, (_, i) => <option key={i} value={i + 1}>Day {i + 1}</option>)}</select>
        <input name="time" placeholder="Time" maxLength={40} style={{ flex: 1 }} />
      </div>
      <textarea name="notes" rows={2} placeholder="Notes, e.g. confirmation number" maxLength={2000} />
      <button type="submit">Add stop</button>
      {error && <p className="small" style={{ color: "var(--danger)" }}>{error}</p>}
    </form>
  );
}

export function TripSettings({ trip }: { trip: { id: string; name: string; startDate: string | null; endDate: string | null; notes: string | null; isPublic: boolean } }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [isPublic, setPublic] = useState(trip.isPublic);
  const url = `/api/trips/${trip.id}`;
  const [shareUrl, setShareUrl] = useState(`/trips/${trip.id}`);
  useEffect(() => setShareUrl(`${window.location.origin}/trips/${trip.id}`), [trip.id]);

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <form
        className="report"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await call(url, "PATCH", { name: f.get("name"), startDate: f.get("startDate") || null, endDate: f.get("endDate") || f.get("startDate") || null, notes: f.get("notes") || null });
            setMsg("Saved"); router.refresh();
          } catch (err) { setMsg((err as Error).message); }
        }}
      >
        <input name="name" defaultValue={trip.name} required maxLength={120} />
        <div style={{ display: "flex", gap: 8 }}>
          <label className="small" style={{ flex: 1 }}>Start<br /><input type="date" name="startDate" defaultValue={trip.startDate ?? ""} style={{ width: "100%" }} /></label>
          <label className="small" style={{ flex: 1 }}>End<br /><input type="date" name="endDate" defaultValue={trip.endDate ?? ""} style={{ width: "100%" }} /></label>
        </div>
        <textarea name="notes" defaultValue={trip.notes ?? ""} rows={3} placeholder="Trip notes" maxLength={5000} />
        <button type="submit">Save changes</button>
        {msg && <p className="small">{msg}</p>}
      </form>

      <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "1rem 0" }} />
      <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={isPublic} onChange={async (e) => { setPublic(e.target.checked); await call(url, "PATCH", { isPublic: e.target.checked }); router.refresh(); }} />
        Anyone with the link can view this trip
      </label>
      {isPublic && (
        <p className="small">
          <code>{shareUrl}</code>{" "}
          <button type="button" className="linkish" onClick={() => navigator.clipboard?.writeText(shareUrl).then(() => setMsg("Link copied"))}>copy</button>
        </p>
      )}

      <button type="button" className="btn-outline" style={{ marginTop: "1rem", color: "var(--danger)", borderColor: "var(--danger)" }}
        onClick={async () => { if (confirm("Delete this trip and all its stops?")) { await call(url, "DELETE"); window.location.href = "/trips"; } }}>
        Delete trip
      </button>
    </div>
  );
}
