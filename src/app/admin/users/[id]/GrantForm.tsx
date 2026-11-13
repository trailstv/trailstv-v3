"use client";

import { useState } from "react";

/** Give a user complimentary TrailsTV+ or a park pack. Plain form POST, so it works even if JS fails. */
export function GrantForm({ userId, parks, durations }: { userId: string; parks: { code: string; name: string }[]; durations: { key: string; label: string }[] }) {
  const [grant, setGrant] = useState("plus");
  const [duration, setDuration] = useState("30d");
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <form action="/api/admin/grants" method="post" className="report card" style={{ maxWidth: 520 }}>
      <h3>Give free access</h3>
      <input type="hidden" name="userId" value={userId} />
      <label className="small">What
        <select name="grant" value={grant} onChange={(e) => setGrant(e.target.value)} style={{ width: "100%" }}>
          <option value="plus">TrailsTV+ (everything: members-only videos, all park packs, GPX)</option>
          <option value="park-pack">One park pack</option>
        </select>
      </label>
      {grant === "park-pack" && (
        <label className="small">Park
          <select name="parkCode" required defaultValue="" style={{ width: "100%" }}>
            <option value="" disabled>Choose a park…</option>
            {parks.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </label>
      )}
      <label className="small">For how long
        <select name="duration" value={duration} onChange={(e) => setDuration(e.target.value)} style={{ width: "100%" }}>
          {durations.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      </label>
      {duration === "custom" && <label className="small">Until <input type="date" name="until" min={tomorrow} required /></label>}
      <input name="note" maxLength={500} placeholder="Reason (optional), e.g. Ranger partner, giveaway winner, support credit" />
      <button type="submit">Grant access</button>
      <p className="small muted" style={{ margin: 0 }}>No payment is taken and nothing changes in Stripe. When it expires, they're back on their previous plan automatically.</p>
    </form>
  );
}
