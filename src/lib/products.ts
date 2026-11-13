import productsJson from "@content/products.json";

export interface Product {
  slug: string;
  name: string;
  description: string;
  mode: "subscription" | "payment";
  interval?: "month" | "year";
  /** Stripe Price lookup_key – the link between this flat file and Stripe. */
  lookupKey: string;
  /** In cents. Used for display and by scripts/stripe-setup.ts to create the Price. */
  unitAmount: number;
  currency: string;
  grants: "plus" | "park-pack";
  perPark?: boolean;
  /** Free trial length for subscriptions (Stripe trial_period_days). Omit for no trial. */
  trialDays?: number;
  featured?: boolean;
  features: string[];
}

export const PRODUCTS = productsJson as Product[];
export const getProduct = (slug: string) => PRODUCTS.find((p) => p.slug === slug);

export function formatPrice(p: Product) {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency.toUpperCase() }).format(p.unitAmount / 100);
  return p.interval ? `${amount}/${p.interval === "month" ? "mo" : "yr"}` : amount;
}
