import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserDetail, GRANT_DURATIONS, requireAdminPage } from "@/lib/admin";
import { getPark, getParks } from "@/lib/content";
import type { AccessGrant } from "@/lib/db/schema";
import { GrantForm } from "./GrantForm";
import { Notice } from "../../Notice";

const d = (x: Date | null | undefined) => (x ? x.toLocaleDateString("en-US", { dateStyle: "medium" }) : "—");

function grantStatus(g: AccessGrant) {
  if (g.revokedAt) return { label: `Revoked ${d(g.revokedAt)}`, active: false };
  if (g.expiresAt && g.expiresAt <= new Date()) return { label: `Expired ${d(g.expiresAt)}`, active: false };
  return { label: g.expiresAt ? `Active until ${d(g.expiresAt)}` : "Active · never expires", active: true };
}

export default async function AdminUser({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const me = await requireAdminPage();
  const { id } = await params;
  const { notice, error } = await searchParams;
  const data = await getUserDetail(id);
  if (!data) notFound();
  const { user, customerId, ent, grants, subs, purchases, log, counts } = data;
  const isSelf = me.id === user.id;

  return (
    <>
      <p className="small"><Link href="/admin/users">← Users</Link></p>
      <h1>{user.name}</h1>
      <p className="muted">
        {user.email} · joined {d(user.createdAt)} · {counts.trips} trips · {counts.completions} logged visits/hikes · {counts.reports} reports
        {customerId && <> · <a href={`https://dashboard.stripe.com/customers/${customerId}`} target="_blank" rel="noopener">Stripe customer ↗</a></>}
      </p>
      <Notice notice={notice} error={error} />

      <h2>Current access</h2>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          {user.role === "admin" && <span className="tier admin">Admin</span>}
          {ent.plus ? (
            <>
              {(ent.plusSource === "subscription" || ent.plusSource === "both") && <span className="tier paid">TrailsTV+ paid{ent.plusRenews ? ` · ${ent.plusCancelsAtPeriodEnd ? "ends" : "renews"} ${d(ent.plusRenews)}` : ""}</span>}
              {(ent.plusSource === "grant" || ent.plusSource === "both") && <span className="tier comp">TrailsTV+ complimentary · {ent.plusGrantExpires ? `until ${d(ent.plusGrantExpires)}` : "never expires"}</span>}
            </>
          ) : <span className="tier free">Free plan</span>}
        </p>
        <p className="small" style={{ marginBottom: 0 }}>
          Park packs: {ent.parkPacks.length ? ent.parkPacks.map((c) => `${getPark(c)?.name.replace(" National Park", "") ?? c}${ent.grantedParkPacks.includes(c) ? " (comp)" : ""}`).join(", ") : "none"}
        </p>
      </div>

      <h2>Give free access</h2>
      <GrantForm
        userId={user.id}
        parks={getParks().map((p) => ({ code: p.code, name: p.name }))}
        durations={Object.entries(GRANT_DURATIONS).map(([key, v]) => ({ key, label: v.label }))}
      />

      <h2>Complimentary access history</h2>
      {grants.length ? (
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Access</th><th>Status</th><th>Reason</th><th>Granted</th><th></th></tr></thead>
            <tbody>
              {grants.map((g) => {
                const st = grantStatus(g);
                return (
                  <tr key={g.id} className={st.active ? "" : "inactive"}>
                    <td>{g.grant === "plus" ? "TrailsTV+" : `Park pack: ${getPark(g.parkCode ?? "")?.name ?? g.parkCode}`}</td>
                    <td>{st.label}</td>
                    <td className="small">{g.note ?? "—"}</td>
                    <td className="small">{d(g.createdAt)}</td>
                    <td>
                      {st.active && (
                        <form className="inline-form" action={`/api/admin/grants/${g.id}/revoke`} method="post">
                          <input type="hidden" name="returnTo" value={`/admin/users/${user.id}`} />
                          <button type="submit" className="btn-outline">Revoke</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">None yet.</p>}

      <h2>Payments</h2>
      {subs.length || purchases.length ? (
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Item</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {subs.map((s) => <tr key={s.id}><td>TrailsTV+ subscription ({s.lookupKey?.replace("trailstv_plus_", "")})</td><td>{s.status}{s.cancelAtPeriodEnd ? " · cancels at period end" : ""}</td><td className="small">period ends {d(s.currentPeriodEnd)}</td></tr>)}
              {purchases.map((p) => <tr key={p.checkoutSessionId}><td>Park pack: {getPark(p.parkCode ?? "")?.name ?? p.parkCode}</td><td>{p.refunded ? "Refunded" : `Paid ${p.amountTotal != null ? "$" + (p.amountTotal / 100).toFixed(2) : ""}`}</td><td className="small">{d(p.createdAt)}</td></tr>)}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">No payments.</p>}
      <p className="small muted">Refunds and subscription changes are done in Stripe, and this page updates through the webhook.</p>

      <h2>Role</h2>
      <form action={`/api/admin/users/${user.id}/role`} method="post" className="card" style={{ maxWidth: 520 }}>
        <p style={{ marginTop: 0 }}>Admins can open this dashboard and give or revoke free access for anyone.</p>
        {user.role === "admin" ? (
          <button type="submit" name="role" value="user" className="btn-outline" disabled={isSelf}>{isSelf ? "You can't remove your own admin role" : "Remove admin role"}</button>
        ) : (
          <button type="submit" name="role" value="admin" className="btn-outline">Make admin</button>
        )}
      </form>

      <h2>Admin activity on this user</h2>
      {log.length ? (
        <ul className="small">
          {log.map((l) => <li key={l.id}>{l.createdAt.toLocaleString("en-US")} · <b>{l.action}</b> by {l.actorEmail} <span className="muted">{JSON.stringify(l.details)}</span></li>)}
        </ul>
      ) : <p className="muted">None.</p>}
    </>
  );
}
