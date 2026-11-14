"use client";

import { useState } from "react";

export function NewTripForm() {
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/trips", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.get("name"), startDate: f.get("startDate") || null, endDate: f.get("endDate") || f.get("startDate") || null }),
    });
    const j = await r.json();
    if (!r.ok) return setError(j.error ?? "Couldn't create trip");
    window.location.href = `/trips/${j.data.id}`;
  }
  return (
    <form className="report card" onSubmit={submit}>
      <h3>New trip</h3>
      <input name="name" required maxLength={120} placeholder="e.g. Utah Mighty 5 road trip" />
      <div style={{ display: "flex", gap: 8 }}>
        <label className="small" style={{ flex: 1 }}>Start<br /><input type="date" name="startDate" style={{ width: "100%" }} /></label>
        <label className="small" style={{ flex: 1 }}>End<br /><input type="date" name="endDate" style={{ width: "100%" }} /></label>
      </div>
      <button type="submit">Create trip</button>
      {error && <p className="small" style={{ color: "var(--danger)" }}>{error}</p>}
    </form>
  );
}
