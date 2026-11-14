import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { addCompletion, CompletionInput, deleteCompletion } from "@/lib/user-data";

/** POST /api/me/completions { kind: "park"|"trail", refId, completedOn: "YYYY-MM-DD", activity?, notes? } */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const parsed = CompletionInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json({ data: await addCompletion(user.id, parsed.data) }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** DELETE /api/me/completions?id=<uuid> */
export async function DELETE(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await deleteCompletion(user.id, id);
  return NextResponse.json({ ok: true });
}
