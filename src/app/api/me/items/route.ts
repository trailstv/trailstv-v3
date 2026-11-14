import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/require-user";
import { getItemStates, RefInput, resolveRef, setFlag } from "@/lib/user-data";

/** GET /api/me/items?refs=trail:zion-angels-landing,park:zion → favorite/saved/completed state per item. */
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const refs = (new URL(req.url).searchParams.get("refs") ?? "")
    .split(",")
    .map((s) => s.split(":"))
    .filter(([k, id]) => k && id)
    .slice(0, 50)
    .map(([kind, refId]) => ({ kind, refId }));
  return NextResponse.json({ data: await getItemStates(user.id, refs) }, { headers: { "Cache-Control": "private, no-store" } });
}

const Body = RefInput.extend({ field: z.enum(["favorite", "saved"]), value: z.boolean() });

/** POST /api/me/items { kind, refId, field: "favorite"|"saved", value } */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const ref = resolveRef(parsed.data);
  if (!ref) return NextResponse.json({ error: "Unknown item" }, { status: 400 });
  await setFlag(user.id, ref, parsed.data.field, parsed.data.value);
  return NextResponse.json({ ok: true });
}
