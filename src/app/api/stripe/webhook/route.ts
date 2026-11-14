import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { fulfillCheckout, markRefunded, syncSubscription } from "@/lib/billing";

/**
 * Stripe webhook. In the Stripe Dashboard → Developers → Webhooks, point an
 * endpoint at https://<your-domain>/api/stripe/webhook with these events:
 *   checkout.session.completed, checkout.session.async_payment_succeeded,
 *   customer.subscription.created, customer.subscription.updated,
 *   customer.subscription.deleted, charge.refunded
 * Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });

  let event: Stripe.Event;
  try {
    // Signature verification needs the exact raw body.
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch (e) {
    return NextResponse.json({ error: `Invalid signature: ${(e as Error).message}` }, { status: 400 });
  }

  // Idempotency: skip events we've already processed (Stripe retries).
  if (db) {
    const inserted = await db.insert(schema.stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning();
    if (inserted.length === 0) return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await fulfillCheckout(event.data.object.id);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object);
        break;
      case "charge.refunded":
        await markRefunded(event.data.object);
        break;
    }
  } catch (e) {
    // Let Stripe retry: remove the idempotency marker and return 500.
    if (db) await db.delete(schema.stripeEvents).where(eq(schema.stripeEvents.id, event.id));
    console.error("webhook handler failed", event.type, e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
