import "server-only";
import Stripe from "stripe";
import type { Product } from "./products";

let _stripe: Stripe | null = null;

/** Lazily created so `next build` works without STRIPE_SECRET_KEY. */
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not configured");
  _stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY, {
    appInfo: { name: "TrailsTV" },
  });
  return _stripe;
}

export const stripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

/** Resolve the live Price for a product via its lookup_key. */
export async function priceFor(product: Product): Promise<Stripe.Price> {
  const { data } = await stripe().prices.list({ lookup_keys: [product.lookupKey], active: true, limit: 1 });
  if (!data[0]) throw new Error(`No active Stripe price with lookup_key "${product.lookupKey}". Run npm run stripe:setup.`);
  return data[0];
}
