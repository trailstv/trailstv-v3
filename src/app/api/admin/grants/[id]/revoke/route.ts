import { NextResponse } from "next/server";
import { requireAdminRoute, revokeGrant } from "@/lib/admin";
import { back } from "../../../_redirect";

/** POST /api/admin/grants/:id/revoke (form, optional returnTo) */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRoute(req);
  if (admin instanceof NextResponse) return admin;
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const f = await req.formData().catch(() => null);
  const row = await revokeGrant(admin, id);
  return back(req, (f?.get("returnTo") as string) ?? (row ? `/admin/users/${row.userId}` : "/admin/grants"), row ? { notice: "revoked" } : { error: "Grant not found or already revoked" });
}
