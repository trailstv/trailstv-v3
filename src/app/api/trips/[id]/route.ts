import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { getUser } from "@/lib/auth";
import { deleteTrip, getTrip, TripPatch, updateTrip } from "@/lib/trips";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/trips/:id – owner, or anyone if the trip is public. */
export async function GET(_req: Request, { params }: Ctx) {
  const data = await getTrip((await params).id, (await getUser())?.id ?? null);
  return data ? NextResponse.json({ data }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** PATCH /api/trips/:id { name?, startDate?, endDate?, notes?, isPublic? } */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const parsed = TripPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const { startDate, endDate } = parsed.data;
  if (startDate && endDate && endDate < startDate) return NextResponse.json({ error: "End date is before start date" }, { status: 400 });
  const row = await updateTrip((await params).id, user.id, parsed.data);
  return row ? NextResponse.json({ data: row }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return (await deleteTrip((await params).id, user.id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
