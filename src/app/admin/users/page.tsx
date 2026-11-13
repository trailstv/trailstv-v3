import Link from "next/link";
import { searchUsers } from "@/lib/admin";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q = "", page = "0" } = await searchParams;
  const p = Math.max(0, Number(page) || 0);
  const { users, hasMore } = await searchUsers(q.trim(), p);
  const qs = (n: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(n) })}`;

  return (
    <>
      <h1>Users</h1>
      <form method="get" style={{ display: "flex", gap: 8, margin: "1rem 0", maxWidth: 520 }}>
        <input name="q" defaultValue={q} placeholder="Search by email or name" style={{ flex: 1, padding: ".55rem .7rem", border: "1px solid var(--line)", borderRadius: 8 }} />
        <button type="submit">Search</button>
      </form>
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>User</th><th>Plan</th><th>Joined</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name}</b><div className="small muted">{u.email}</div></td>
                <td>
                  {u.role === "admin" && <span className="tier admin">Admin</span>}
                  {u.paidPlus && <span className="tier paid">TrailsTV+ paid</span>}
                  {u.compPlus && <span className="tier comp">TrailsTV+ comp</span>}
                  {u.compPacks > 0 && <span className="tier comp">{u.compPacks} comp pack{u.compPacks > 1 ? "s" : ""}</span>}
                  {!u.paidPlus && !u.compPlus && !u.compPacks && <span className="tier free">Free</span>}
                </td>
                <td className="small">{u.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</td>
                <td><Link href={`/admin/users/${u.id}`}>Manage →</Link></td>
              </tr>
            ))}
            {!users.length && <tr><td colSpan={4} className="muted">No users found.</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
        {p > 0 && <Link href={qs(p - 1)}>← Previous</Link>}
        {hasMore && <Link href={qs(p + 1)}>Next →</Link>}
      </p>
    </>
  );
}
