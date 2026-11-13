import Link from "next/link";
import { listGrants } from "@/lib/admin";
import { getPark } from "@/lib/content";
import { Notice } from "../Notice";

const d = (x: Date | null) => (x ? x.toLocaleDateString("en-US", { dateStyle: "medium" }) : "Never");

export default async function AdminGrants({ searchParams }: { searchParams: Promise<{ show?: string; notice?: string; error?: string }> }) {
  const { show, notice, error } = await searchParams;
  const filter = show === "all" ? "all" : "active";
  const rows = await listGrants(filter);
  return (
    <>
      <h1>Complimentary access</h1>
      <p className="muted">Everyone you&apos;ve given free TrailsTV+ or park packs. To add one, open a user from <Link href="/admin/users">Users</Link>.</p>
      <Notice notice={notice} error={error} />
      <p className="chips">
        <Link className={`chip ${filter === "active" ? "active" : ""}`} href="/admin/grants">Active</Link>
        <Link className={`chip ${filter === "all" ? "active" : ""}`} href="/admin/grants?show=all">All, including expired & revoked</Link>
      </p>
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>User</th><th>Access</th><th>Expires</th><th>Reason</th><th></th></tr></thead>
          <tbody>
            {rows.map(({ grant: g, email, name }) => {
              const active = !g.revokedAt && (!g.expiresAt || g.expiresAt > new Date());
              return (
                <tr key={g.id} className={active ? "" : "inactive"}>
                  <td><Link href={`/admin/users/${g.userId}`}>{name}</Link><div className="small muted">{email}</div></td>
                  <td>{g.grant === "plus" ? "TrailsTV+" : `Pack: ${getPark(g.parkCode ?? "")?.name.replace(" National Park", "") ?? g.parkCode}`}</td>
                  <td>{g.revokedAt ? `Revoked ${d(g.revokedAt)}` : d(g.expiresAt)}</td>
                  <td className="small">{g.note ?? "—"}</td>
                  <td>
                    {active && (
                      <form className="inline-form" action={`/api/admin/grants/${g.id}/revoke`} method="post">
                        <input type="hidden" name="returnTo" value="/admin/grants" />
                        <button type="submit" className="btn-outline">Revoke</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={5} className="muted">None.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
