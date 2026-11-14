import { NextResponse, type NextRequest } from "next/server";
import { fulfillCheckout } from "@/lib/billing";

/**
 * Stripe redirects here after payment. We verify the session server-side
 * (never trust the query string) and fulfill it in case the webhook hasn't
 * arrived yet, then go to /account.
 */
export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId?.startsWith("cs_")) return NextResponse.redirect(`${origin}/pricing?error=missing-session`);
  try {
    const customerId = await fulfillCheckout(sessionId);
    return NextResponse.redirect(`${origin}/account?notice=${customerId ? "thanks" : "payment-processing"}`);
  } catch (e) {
    console.error("checkout complete failed", e);
    return NextResponse.redirect(`${origin}/account?notice=payment-processing`);
  }
}
