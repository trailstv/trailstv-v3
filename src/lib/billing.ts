import "server-only";
import type Stripe from "stripe";
import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db, schema } from "./db";
import { stripe } from "./stripe";
import { getProduct } from "./products";

const idOf = (x: string | { id: string } | null | undefined) => (typeof x === "string" ? x : x?.id ?? null);

async function upsertCustomer(customerId: string, email: string | null | undefined, userId: string | null | undefined) {
  if (!db) return;
  await db
    .insert(schema.customers)
    .values({ stripeCustomerId: customerId, email: email ?? null, userId: userId ?? null })
    .onConflictDoUpdate({ target: schema.customers.stripeCustomerId, set: { email: email ?? undefined, ...(userId ? { userId } : {}) } });
}

/** The user's Stripe customer id, creating the customer on first purchase. */
export async function getOrCreateCustomer(u: { id: string; email: string; name: string }): Promise<string> {
  if (!db) throw new Error("DATABASE_URL not configured");
  const [row] = await db.select().from(schema.customers).where(eq(schema.customers.userId, u.id)).limit(1);
  if (row) return row.stripeCustomerId;
  const c = await stripe().customers.create({ email: u.email, name: u.name, metadata: { userId: u.id } }, { idempotencyKey: `customer-${u.id}` });
  await upsertCustomer(c.id, u.email, u.id);
  return c.id;
}

export async function customerIdForUser(userId: string | null | undefined): Promise<string | null> {
  if (!db || !userId) return null;
  const [row] = await db.select().from(schema.customers).where(eq(schema.customers.userId, userId)).limit(1);
  return row?.stripeCustomerId ?? null;
}

/** Mirror a Stripe subscription into Neon. */
export async function syncSubscription(sub: Stripe.Subscription) {
  if (!db) return;
  const item = sub.items.data[0];
  const row = {
    id: sub.id,
    stripeCustomerId: idOf(sub.customer)!,
    status: sub.status,
    lookupKey: item?.price.lookup_key ?? null,
    // Since API version 2025-03-31 the billing period lives on the subscription item.
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    updatedAt: new Date(),
  };
  await db.insert(schema.subscriptions).values(row).onConflictDoUpdate({ target: schema.subscriptions.id, set: row });
}

/**
 * Grant whatever a completed Checkout Session paid for. Idempotent: it's
 * called from both the webhook and the success redirect, whichever comes first.
 * Returns the Stripe customer id.
 */
export async function fulfillCheckout(sessionId: string): Promise<string | null> {
  const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  if (session.status !== "complete" || session.payment_status === "unpaid") return null;
  const customerId = idOf(session.customer);
  if (!customerId) return null;

  await upsertCustomer(customerId, session.customer_details?.email, session.client_reference_id);

  if (session.mode === "subscription" && session.subscription && typeof session.subscription !== "string") {
    await syncSubscription(session.subscription);
  }

  if (session.mode === "payment" && db) {
    const product = getProduct(session.metadata?.product ?? "");
    await db
      .insert(schema.purchases)
      .values({
        checkoutSessionId: session.id,
        stripeCustomerId: customerId,
        paymentIntentId: idOf(session.payment_intent),
        productSlug: product?.slug ?? session.metadata?.product ?? "unknown",
        parkCode: session.metadata?.parkCode || null,
        amountTotal: session.amount_total,
        currency: session.currency,
      })
      .onConflictDoNothing();
  }
  return customerId;
}

export async function markRefunded(charge: Stripe.Charge) {
  const pi = idOf(charge.payment_intent);
  if (!db || !pi || !charge.refunded) return; // only full refunds revoke access
  await db.update(schema.purchases).set({ refunded: true }).where(eq(schema.purchases.paymentIntentId, pi));
}

/* -------------------------------- Entitlements -------------------------------- */

export interface Entitlements {
  customerId: string | null;
  plus: boolean;
  /** Where TrailsTV+ comes from: a paid Stripe subscription, an admin grant, or both. */
  plusSource: "subscription" | "grant" | "both" | null;
  plusRenews: Date | null;
  plusCancelsAtPeriodEnd: boolean;
  /** Complimentary TrailsTV+ end date (null = never expires) when plusSource includes "grant". */
  plusGrantExpires: Date | null;
  parkPacks: string[];
  /** Park packs that are complimentary (subset of parkPacks). */
  grantedParkPacks: string[];
}

const NONE: Entitlements = {
  customerId: null, plus: false, plusSource: null, plusRenews: null, plusCancelsAtPeriodEnd: false, plusGrantExpires: null, parkPacks: [], grantedParkPacks: [],
};

/** Active (not revoked, started, not expired) admin grants for a user. */
export async function activeGrants(userId: string) {
  if (!db) return [];
  const now = new Date();
  return db
    .select()
    .from(schema.accessGrants)
    .where(and(
      eq(schema.accessGrants.userId, userId),
      isNull(schema.accessGrants.revokedAt),
      lte(schema.accessGrants.startsAt, now),
      or(isNull(schema.accessGrants.expiresAt), gt(schema.accessGrants.expiresAt, now)),
    ));
}

/** Everything a signed-in user can access: paid (Stripe) + complimentary (admin grants). */
export async function getUserEntitlements(userId: string | null | undefined): Promise<Entitlements> {
  if (!userId || !db) return NONE;
  const [paid, grants] = await Promise.all([getEntitlements(await customerIdForUser(userId)), activeGrants(userId)]);
  const plusGrants = grants.filter((g) => g.grant === "plus");
  // Longest-running grant wins (null expiry = forever).
  const plusGrantExpires = plusGrants.length
    ? plusGrants.some((g) => !g.expiresAt) ? null : new Date(Math.max(...plusGrants.map((g) => g.expiresAt!.getTime())))
    : null;
  const grantedParkPacks = grants.filter((g) => g.grant === "park-pack" && g.parkCode).map((g) => g.parkCode!);
  const hasGrantPlus = plusGrants.length > 0;
  return {
    ...paid,
    plus: paid.plus || hasGrantPlus,
    plusSource: paid.plus && hasGrantPlus ? "both" : paid.plus ? "subscription" : hasGrantPlus ? "grant" : null,
    plusGrantExpires,
    parkPacks: [...new Set([...paid.parkPacks, ...grantedParkPacks])],
    grantedParkPacks,
  };
}

/** Paid entitlements only, from Stripe data. */
export async function getEntitlements(customerId: string | null): Promise<Entitlements> {
  if (!customerId || !db) return { ...NONE, customerId };
  const [subs, packs] = await Promise.all([
    db.select().from(schema.subscriptions).where(and(eq(schema.subscriptions.stripeCustomerId, customerId), inArray(schema.subscriptions.status, ["active", "trialing"]))),
    db.select().from(schema.purchases).where(and(eq(schema.purchases.stripeCustomerId, customerId), eq(schema.purchases.refunded, false))),
  ]);
  const sub = subs[0];
  return {
    ...NONE,
    customerId,
    plus: Boolean(sub),
    plusSource: sub ? "subscription" : null,
    plusRenews: sub?.currentPeriodEnd ?? null,
    plusCancelsAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    parkPacks: packs.filter((p) => p.parkCode).map((p) => p.parkCode!),
  };
}

export const canDownloadPark = (e: Entitlements, parkCode: string) => e.plus || e.parkPacks.includes(parkCode);
