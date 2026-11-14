import type { Metadata } from "next";
import { PageHero } from "@/components/hero/PageHero";
import { allParkHeroes } from "@/lib/hero";
import Link from "next/link";
import { PRODUCTS, formatPrice } from "@/lib/products";
import { getParks } from "@/lib/content";
import { BuyButton } from "@/components/BuyButton";

export const metadata: Metadata = { title: "TrailsTV+ & offline packs" };

const ERRORS: Record<string, string> = {
  "stripe-not-configured": "Payments aren't set up yet (STRIPE_SECRET_KEY missing).",
  "unknown-product": "That product doesn't exist.",
  "choose-a-park": "Pick a park for the offline pack.",
  "missing-session": "We couldn't find that checkout session.",
};

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ error?: string; checkout?: string }> }) {
  const { error, checkout } = await searchParams;
  const plans = PRODUCTS.filter((p) => p.grants === "plus");
  const pack = PRODUCTS.find((p) => p.grants === "park-pack");
  const parks = getParks();

  return (
    <>
    <PageHero random={await allParkHeroes()} eyebrow="TrailsTV+" title="Go further with TrailsTV+" subtitle="Members-only park videos, offline park packs and GPX downloads." />
    <div className="container" style={{ paddingTop: "2rem", maxWidth: 1080 }}>
      <p className="muted" style={{ fontSize: "1.05rem", margin: 0 }}>Free forever: every park, trail, and live condition. Paid plans add downloads and offline use.</p>
      {error && <div className="notice warn">{ERRORS[error] ?? "Something went wrong."}</div>}
      {checkout === "canceled" && <div className="notice warn">Checkout canceled. You weren&apos;t charged.</div>}

      <div className="plans">
        {plans.map((p) => (
          <div key={p.slug} className={`plan-card${p.featured ? " featured" : ""}`}>
            {p.featured && <span className="plan-flag">Best value</span>}
            <h3>{p.name}</h3>
            <div className="price">{formatPrice(p).split("/")[0]}<small>/{p.interval}</small></div>
            <p className="plan-desc">{p.description}</p>
            <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
            <div className="plan-cta">
              <BuyButton product={p.slug} variant={p.featured ? undefined : "outline"}>{p.trialDays ? `Start ${p.trialDays}-day free trial` : "Subscribe"}</BuyButton>
              {p.trialDays ? <p className="plan-fine">Free for {p.trialDays} days for new members, then {formatPrice(p)}. Cancel anytime.</p> : <p className="plan-fine">Cancel anytime.</p>}
            </div>
          </div>
        ))}

        {pack && (
          <div className="plan-card">
            <h3>{pack.name}</h3>
            <div className="price">{formatPrice(pack)}<small>one-time</small></div>
            <p className="plan-desc">{pack.description}</p>
            <ul>{pack.features.map((f) => <li key={f}>{f}</li>)}</ul>
            <form action="/api/checkout" method="post" className="plan-cta">
              <input type="hidden" name="product" value={pack.slug} />
              <label className="small" htmlFor="pack-park" style={{ fontWeight: 600 }}>Choose your park</label>
              <select id="pack-park" name="parkCode" required defaultValue="">
                <option value="" disabled>Select a park…</option>
                {parks.map((park) => <option key={park.code} value={park.code}>{park.name}</option>)}
              </select>
              <button type="submit" className="btn-outline">Buy park pack</button>
            </form>
          </div>
        )}
      </div>

      <p className="muted small" style={{ marginTop: "2rem", textAlign: "center", lineHeight: 1.6 }}>
        Payments are processed securely by Stripe. Cancel anytime from your <Link href="/account">account</Link>.
        TrailsTV is not affiliated with the National Park Service. Park entrance passes and permits are sold only at{" "}
        Recreation.gov and nps.gov.
      </p>
    </div>
    </>
  );
}
