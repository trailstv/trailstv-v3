import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/require-user";
import { RefInput, resolveRef } from "@/lib/user-data";
import { addStop } from "@/lib/trips";

const Body = RefInput.extend({
  day: z.number().int().min(1).max(60).optional(),
  time: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/** POST /api/trips/:id/stops { kind, refId?, name?, lat?, lon?, parkCode?, day?, time?, notes? } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const ref = resolveRef(parsed.data);
  if (!ref) return NextResponse.json({ error: "Unknown stop" }, { status: 400 });
  const stop = await addStop((await params).id, user.id, ref, parsed.data);
  return stop ? NextResponse.json({ data: stop }, { status: 201 }) : NextResponse.json({ error: "Trip not found" }, { status: 404 });
}
