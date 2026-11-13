import Link from "next/link";
import type { Trail } from "@/lib/types";
import { trailMeta, difficultyLabel } from "@/lib/trail-format";

export function TrailCard({ trail: t }: { trail: Trail }) {
  return (
    <Link href={`/trails/${t.id}`} className="card">
      <span className={`badge ${t.difficulty ?? ""}`}>{difficultyLabel(t.difficulty)}</span>
      {t.permit && <span className="badge warn" style={{ marginLeft: 6 }}>Permit</span>}
      <h3 style={{ marginTop: 8 }}>{t.name}</h3>
      <p className="muted small">
        {trailMeta(t, { permit: false })}{t.routeType ? ` · ${t.routeType}` : ""}
      </p>
      <p className="small">{t.summary}</p>
    </Link>
  );
}
