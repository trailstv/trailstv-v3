import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { deleteStop, StopPatch, updateStop } from "@/lib/trips";

type Ctx = { params: Promise<{ id: string; stopId: string }> };

/** PATCH /api/trips/:id/stops/:stopId { day?, time?, notes?, move?: "up"|"down" } */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const parsed = StopPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const { id, stopId } = await params;
  return (await updateStop(id, stopId, user.id, parsed.data)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id, stopId } = await params;
  return (await deleteStop(id, stopId, user.id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
