import { NextResponse, type NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { getUser } from "@/lib/auth";
import { customerIdForUser } from "@/lib/billing";

/** POST /api/billing/portal – Stripe Customer Portal (cancel, update card, invoices). */
export async function POST(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const customer = await customerIdForUser((await getUser())?.id);
  if (!customer) return NextResponse.redirect(`${origin}/account`, 303);
  const portal = await stripe().billingPortal.sessions.create({ customer, return_url: `${origin}/account` });
  return NextResponse.redirect(portal.url, 303);
}
