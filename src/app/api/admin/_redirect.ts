import { NextResponse } from "next/server";

/** 303 back to an admin page (relative /admin paths only). */
export function back(req: Request, to: string | null | undefined, params: Record<string, string>) {
  const path = to && to.startsWith("/admin") && !to.startsWith("//") ? to : "/admin";
  const url = new URL(path, process.env.NEXT_PUBLIC_SITE_URL ?? req.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}
