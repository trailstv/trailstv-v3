import Link from "next/link";
import { adminStats } from "@/lib/admin";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default async function AdminHome() {
  const s = await adminStats();
  return (
    <>
      <h1>Overview</h1>
      <div className="stat-row">
        <div className="card"><b>{s.users}</b><span className="small muted">users</span></div>
        <div className="card"><b>{s.newUsers30d}</b><span className="small muted">new in 30 days</span></div>
        <div className="card"><b>{s.paidPlus}</b><span className="small muted">paid TrailsTV+</span></div>
        <div className="card"><b>{s.compPlus}</b><span className="small muted">complimentary TrailsTV+</span></div>
        <div className="card"><b>{s.packsSold}</b><span className="small muted">park packs sold ({money(s.packRevenueCents)})</span></div>
        <div className="card"><b>{s.compPacks}</b><span className="small muted">complimentary packs</span></div>
      </div>
      <p className="small muted" style={{ marginTop: ".75rem" }}>
        Subscription revenue, payouts and refunds live in your <a href="https://dashboard.stripe.com" target="_blank" rel="noopener">Stripe Dashboard</a>.
      </p>

      <h2>Newest users</h2>
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>Name</th><th>Email</th><th>Joined</th></tr></thead>
          <tbody>
            {s.recent.map((u) => (
              <tr key={u.id}>
                <td><Link href={`/admin/users/${u.id}`}>{u.name}</Link></td>
                <td>{u.email}</td>
                <td>{u.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: "1rem" }}><Link href="/admin/users">All users →</Link></p>
    </>
  );
}
