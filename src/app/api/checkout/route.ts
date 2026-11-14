import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getProduct } from "@/lib/products";
import { getPark } from "@/lib/content";
import { priceFor, stripe, stripeEnabled } from "@/lib/stripe";
import { getUser } from "@/lib/auth";
import { getUserEntitlements, getOrCreateCustomer } from "@/lib/billing";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * POST /api/checkout  (plain <form method="post">, works without JS)
 *   product=plus-yearly | plus-monthly | park-pack
 *   parkCode=zion        (required for per-park products)
 * Requires sign-in. Redirects (303) to Stripe-hosted Checkout.
 */
export async function POST(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const back = (q: string) => NextResponse.redirect(`${origin}/pricing?${q}`, 303);

  if (!stripeEnabled()) return back("error=stripe-not-configured");

  const form = await req.formData();
  const product = getProduct(String(form.get("product") ?? ""));
  if (!product) return back("error=unknown-product");

  const park = product.perPark ? getPark(String(form.get("parkCode") ?? "")) : undefined;
  if (product.perPark && !park) return back("error=choose-a-park");

  const user = await getUser();
  if (!user) {
    const returnTo = park ? `/parks/${park.code}` : "/pricing";
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(returnTo)}`, 303);
  }

  const customerId = await getOrCreateCustomer(user);
  const ent = await getUserEntitlements(user.id);
  if (product.grants === "plus" && ent.plus) return NextResponse.redirect(`${origin}/account?notice=already-plus`, 303);
  if (park && (ent.plus || ent.parkPacks.includes(park.code))) return NextResponse.redirect(`${origin}/account?notice=already-owned`, 303);

  const price = await priceFor(product);
  // Free trial only for customers who've never had a subscription.
  const hadSubscription = db ? (await db.select({ id: schema.subscriptions.id }).from(schema.subscriptions).where(eq(schema.subscriptions.stripeCustomerId, customerId)).limit(1)).length > 0 : true;
  const trialDays = product.trialDays && !hadSubscription ? product.trialDays : undefined;
  const metadata = { product: product.slug, parkCode: park?.code ?? "", userId: user.id };

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: product.mode,
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: `${origin}/api/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: park ? `${origin}/parks/${park.code}?checkout=canceled` : `${origin}/pricing?checkout=canceled`,
    allow_promotion_codes: true,
    automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === "true" },
    ...(process.env.STRIPE_AUTOMATIC_TAX === "true" ? { customer_update: { address: "auto" as const } } : {}),
    metadata,
    ...(product.mode === "subscription"
      ? { subscription_data: { metadata, ...(trialDays ? { trial_period_days: trialDays } : {}) } }
      : { payment_intent_data: { metadata, description: park ? `${product.name}: ${park.name}` : product.name } }),
  };

  const session = await stripe().checkout.sessions.create(params);
  return NextResponse.redirect(session.url!, 303);
}
