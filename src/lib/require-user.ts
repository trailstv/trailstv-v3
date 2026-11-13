import { NextResponse } from "next/server";
import { getUser, type SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Returns the signed-in user, or a 401/503 response to send back. */
export async function requireUser(): Promise<SessionUser | NextResponse> {
  if (!db) return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  const user = await getUser();
  return user ?? NextResponse.json({ error: "Sign in required", login: "/login" }, { status: 401 });
}
