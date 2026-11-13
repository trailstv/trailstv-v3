/**
 * Create (or update) Stripe Products + Prices from content/products.json.
 *
 *   STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup
 *
 * Idempotent. Prices are found by lookup_key. If you change unitAmount in
 * products.json, a new Price is created and the lookup_key moves to it
 * (existing subscribers keep their old price until you migrate them).
 */
import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("Set STRIPE_SECRET_KEY");
const stripe = new Stripe(key);

interface P { slug: string; name: string; description: string; mode: "subscription" | "payment"; interval?: "month" | "year"; lookupKey: string; unitAmount: number; currency: string }
const products: P[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "content", "products.json"), "utf8"));

async function main() {
  console.log(key!.startsWith("sk_live") ? "⚠️  LIVE MODE" : "Test mode");
  for (const p of products) {
    const existing = (await stripe.prices.list({ lookup_keys: [p.lookupKey], expand: ["data.product"], limit: 1 })).data[0];
    const same =
      existing &&
      existing.unit_amount === p.unitAmount &&
      existing.currency === p.currency &&
      (existing.recurring?.interval ?? undefined) === p.interval;

    if (same) {
      console.log(`✓ ${p.slug}: ${existing.id} (unchanged)`);
      continue;
    }

    // Reuse the product if a price existed, otherwise find by metadata or create.
    let productId = existing ? (typeof existing.product === "string" ? existing.product : existing.product.id) : undefined;
    if (!productId) {
      const found = await stripe.products.search({ query: `metadata['slug']:'${p.slug}'` });
      productId = found.data[0]?.id ?? (await stripe.products.create({ name: p.name, description: p.description, metadata: { slug: p.slug } })).id;
    }

    const price = await stripe.prices.create({
      product: productId,
      unit_amount: p.unitAmount,
      currency: p.currency,
      lookup_key: p.lookupKey,
      transfer_lookup_key: true,
      ...(p.mode === "subscription" ? { recurring: { interval: p.interval! } } : {}),
      metadata: { slug: p.slug },
    });
    if (existing) await stripe.prices.update(existing.id, { active: false });
    console.log(`+ ${p.slug}: ${price.id} (${existing ? "replaced " + existing.id : "created"})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
