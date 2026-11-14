import { NextResponse } from "next/server";
import { requireAdminRoute, setRole } from "@/lib/admin";
import { back } from "../../../_redirect";

/** POST /api/admin/users/:id/role (form: role=user|admin) */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRoute(req);
  if (admin instanceof NextResponse) return admin;
  const id = (await params).id;
  const role = (await req.formData()).get("role");
  if (role !== "user" && role !== "admin") return back(req, `/admin/users/${id}`, { error: "Invalid role" });
  try {
    await setRole(admin, id, role);
    return back(req, `/admin/users/${id}`, { notice: role === "admin" ? "made-admin" : "removed-admin" });
  } catch (e) {
    return back(req, `/admin/users/${id}`, { error: (e as Error).message });
  }
}
