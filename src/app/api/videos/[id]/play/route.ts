import { NextResponse } from "next/server";
import { getVideo, embedUrl } from "@/lib/videos";
import { getUser } from "@/lib/auth";
import { getUserEntitlements } from "@/lib/billing";

/**
 * GET /api/videos/:id/play → { embedUrl }
 * Free videos: anyone. Members-only: signed in + active TrailsTV+.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const video = getVideo((await params).id);
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  if (video.access === "plus") {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Sign in to watch", login: "/login" }, { status: 401 });
    if (!(await getUserEntitlements(user.id)).plus) return NextResponse.json({ error: "TrailsTV+ members only", upgrade: "/pricing" }, { status: 402 });
  }
  return NextResponse.json({ embedUrl: embedUrl(video.source) }, { headers: { "Cache-Control": "private, no-store" } });
}
