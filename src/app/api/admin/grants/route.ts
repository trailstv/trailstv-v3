import { NextResponse } from "next/server";
import { createGrant, GrantInput, requireAdminRoute } from "@/lib/admin";
import { back } from "../_redirect";

/** POST /api/admin/grants (form) – give a user complimentary TrailsTV+ or a park pack. */
export async function POST(req: Request) {
  const admin = await requireAdminRoute(req);
  if (admin instanceof NextResponse) return admin;
  const f = await req.formData();
  const str = (k: string) => (f.get(k) ? String(f.get(k)) : undefined);
  const userId = str("userId") ?? "";
  const parsed = GrantInput.safeParse({ userId, grant: str("grant"), parkCode: str("parkCode"), duration: str("duration"), until: str("until"), note: str("note") });
  if (!parsed.success) return back(req, `/admin/users/${userId}`, { error: parsed.error.issues[0]?.message ?? "Invalid grant" });
  try {
    await createGrant(admin, parsed.data);
    return back(req, `/admin/users/${userId}`, { notice: "granted" });
  } catch (e) {
    return back(req, `/admin/users/${userId}`, { error: (e as Error).message });
  }
}
