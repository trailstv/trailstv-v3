import { NextResponse } from "next/server";
import { searchGrouped } from "@/lib/search";

/** GET /api/search?q=yosemite → top results per type for the header search box. */
export function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 100);
  const groups = q.trim().length >= 2 ? searchGrouped(q) : [];
  return NextResponse.json({ q, groups }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
