import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { createTrip, listTrips, TripInput } from "@/lib/trips";

/** GET /api/trips – the signed-in user's trips. */
export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ data: await listTrips(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
}

/** POST /api/trips { name, startDate?, endDate?, notes? } */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const parsed = TripInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid trip" }, { status: 400 });
  return NextResponse.json({ data: await createTrip(user.id, parsed.data) }, { status: 201 });
}
