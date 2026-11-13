import Link from "next/link";
import { listAudit } from "@/lib/admin";

const LABELS: Record<string, string> = { "grant.create": "Gave free access", "grant.revoke": "Revoked access", "role.set": "Changed role" };

export default async function AdminAudit() {
  const rows = await listAudit();
  return (
    <>
      <h1>Audit log</h1>
      <p className="muted">Every admin action, newest first.</p>
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>User</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const det = (r.details ?? {}) as Record<string, unknown>;
              return (
                <tr key={r.id}>
                  <td className="small">{r.createdAt.toLocaleString("en-US")}</td>
                  <td className="small">{r.actorEmail}</td>
                  <td>{LABELS[r.action] ?? r.action}</td>
                  <td className="small">{r.targetUserId ? <Link href={`/admin/users/${r.targetUserId}`}>{String(det.email ?? "view")}</Link> : "—"}</td>
                  <td className="small muted">
                    {[det.grant === "plus" ? "TrailsTV+" : det.grant ? `pack ${det.parkCode}` : null, det.role ? `role → ${det.role}` : null, det.expiresAt ? `until ${new Date(String(det.expiresAt)).toLocaleDateString()}` : det.grant && r.action === "grant.create" ? "no expiry" : null, det.note ? `“${det.note}”` : null].filter(Boolean).join(" · ")}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={5} className="muted">Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
