import type { Metadata } from "next";
import { SignOutButton } from "@/components/SignOutButton";
import { PageHero } from "@/components/hero/PageHero";
import { allParkHeroes } from "@/lib/hero";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getUserEntitlements } from "@/lib/billing";
import { getPark } from "@/lib/content";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Your account" };

const NOTICES: Record<string, [string, string?]> = {
  thanks: ["Thanks for your purchase! Your downloads are unlocked below."],
  "payment-processing": ["Your payment is processing. Refresh in a minute.", "warn"],
  "already-plus": ["You already have TrailsTV+, which includes every park pack."],
  "already-owned": ["You already own that park pack."],
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const user = await getUser();
  if (!user) redirect("/login?next=/account");
  const ent = await getUserEntitlements(user.id);
  const n = notice ? NOTICES[notice] : undefined;

  return (
    <>
    <PageHero random={await allParkHeroes()} eyebrow="Account" title="Billing & downloads" />
    <div className="container" style={{ maxWidth: 760, marginTop: "1rem" }}>
      <div className="profile-bar">
        <div className="small muted">Signed in as <b>{user.email}</b> · <Link href="/me">My Parks →</Link></div>
        <SignOutButton />
      </div>
      {n && <div className={`notice ${n[1] ?? ""}`}>{n[0]}</div>}
      {!db && <div className="notice warn">Connect Neon (DATABASE_URL) to track purchases.</div>}

      {!ent.customerId && !ent.plus && !ent.parkPacks.length ? (
        <div className="card">
          <p>No purchases yet.</p>
          <Link href="/pricing">See TrailsTV+ and offline packs →</Link>
        </div>
      ) : (
        <>
          <div className="card">
            <h3>TrailsTV+</h3>
            {ent.plus ? (
              <p>
                <span className="badge easy">Active</span>{" "}
                {ent.plusSource !== "grant" && ent.plusRenews && (ent.plusCancelsAtPeriodEnd ? "Ends " : "Renews ") + ent.plusRenews.toLocaleDateString("en-US", { dateStyle: "medium" })}
                {(ent.plusSource === "grant" || ent.plusSource === "both") && (
                  <span className="small"> 🎁 Complimentary{ent.plusGrantExpires ? ` until ${ent.plusGrantExpires.toLocaleDateString("en-US", { dateStyle: "medium" })}` : ""}</span>
                )}
              </p>
            ) : (
              <p className="muted">Not subscribed. <Link href="/pricing">Upgrade</Link></p>
            )}
            {ent.customerId && <form action="/api/billing/portal" method="post">
              <button type="submit" className="btn-outline">Manage billing, cards & invoices</button>
            </form>}
          </div>

          <h2>Offline park packs</h2>
          {ent.plus && <p className="muted small">TrailsTV+ includes every park. Download any park pack from its page.</p>}
          {ent.parkPacks.length ? (
            <div className="grid">
              {ent.parkPacks.map((code) => (
                <div key={code} className="card">
                  <h3>{getPark(code)?.name ?? code}</h3>
                  {ent.grantedParkPacks.includes(code) && <p className="small muted">🎁 Complimentary</p>}
                  <a href={`/api/parks/${code}/pack`}>Download pack ↓</a>
                </div>
              ))}
            </div>
          ) : !ent.plus && <p className="muted">None yet.</p>}
        </>
      )}
    </div>
    </>
  );
}
