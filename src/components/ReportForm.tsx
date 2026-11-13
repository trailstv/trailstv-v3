"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";

const TAGS = ["great", "crowded", "muddy", "icy", "snow-covered", "high-water", "bugs", "downed-trees", "smoky", "closed"];

export function ReportForm({ parkCode, trailId, activities }: { parkCode: string; trailId?: string; activities: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: session, isPending } = useSession();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parkCode, trailId, activity: f.get("activity"),
        rating: Number(f.get("rating")), tripDate: f.get("tripDate") || undefined, conditionTags: tags, body: f.get("body"),
      }),
    });
    setBusy(false);
    if (res.ok) { setStatus("Thanks! Your report is posted."); (e.target as HTMLFormElement).reset(); setTags([]); router.refresh(); }
    else setStatus("Couldn't post: " + JSON.stringify((await res.json()).error));
  }

  if (isPending) return null;
  if (!session?.user) {
    return (
      <div className="card">
        <h3>Add a trip report</h3>
        <p className="small"><Link href={`/login?next=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname)}`}>Sign in</Link> to share conditions with other visitors.</p>
      </div>
    );
  }

  return (
    <form className="report card" onSubmit={submit}>
      <h3>Add a trip report <span className="muted small">as {session.user.name}</span></h3>
      <select name="activity" defaultValue={activities[0]?.slug}>
        {activities.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
      </select>
      <select name="rating" defaultValue="5">
        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
      </select>
      <input type="date" name="tripDate" />
      <div className="chips">
        {TAGS.map((t) => (
          <button type="button" key={t} className={`chip ${tags.includes(t) ? "active" : ""}`}
            onClick={() => setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))}>{t}</button>
        ))}
      </div>
      <textarea name="body" rows={4} placeholder="How were conditions?" required minLength={10} />
      <button disabled={busy}>{busy ? "Posting…" : "Post report"}</button>
      {status && <p className="small">{status}</p>}
    </form>
  );
}
