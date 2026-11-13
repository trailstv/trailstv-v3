import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function Reports({ parkCode, trailId }: { parkCode: string; trailId?: string }) {
  if (!db) return <p className="muted small">Connect Neon (DATABASE_URL) to enable trip reports.</p>;
  let rows: schema.TripReport[] = [];
  try {
    rows = await db
      .select()
      .from(schema.tripReports)
      .where(and(eq(schema.tripReports.parkCode, parkCode), eq(schema.tripReports.hidden, false), trailId ? eq(schema.tripReports.trailId, trailId) : undefined))
      .orderBy(desc(schema.tripReports.createdAt))
      .limit(20);
  } catch {
    return <p className="muted small">Trip reports unavailable (run <code>npm run db:push</code>).</p>;
  }
  if (!rows.length) return <p className="muted">No reports yet — be the first.</p>;
  return (
    <div className="grid">
      {rows.map((r) => (
        <div key={r.id} className="card">
          <b>{"★".repeat(r.rating)}</b> <span className="muted small">{r.authorName} · {r.tripDate ?? r.createdAt.toISOString().slice(0, 10)} · {r.activity}</span>
          <div className="chips">{r.conditionTags.map((t) => <span key={t} className="chip">{t}</span>)}</div>
          <p className="small">{r.body}</p>
        </div>
      ))}
    </div>
  );
}
