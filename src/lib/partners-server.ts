import "server-only";
import crypto from "node:crypto";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "./db";
import type { InquiryInput } from "./partners";

export type InquiryStatus = "new" | "contacted" | "closed" | "spam";
export const INQUIRY_STATUSES: InquiryStatus[] = ["new", "contacted", "closed", "spam"];

export const hashIp = (ip: string | null) =>
  ip ? crypto.createHash("sha256").update(`${process.env.BETTER_AUTH_SECRET ?? "trailstv"}:${ip}`).digest("hex").slice(0, 32) : null;

/** At most 3 enquiries an hour per IP, and 3 a day per email address. */
export async function tooManyInquiries(ipHash: string | null, email: string): Promise<boolean> {
  if (!db) return false;
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const t = schema.partnerInquiries;
  const [[byIp], [byEmail]] = await Promise.all([
    ipHash ? db.select({ n: count() }).from(t).where(and(eq(t.ipHash, ipHash), gte(t.createdAt, hourAgo))) : Promise.resolve([{ n: 0 }]),
    db.select({ n: count() }).from(t).where(and(eq(t.email, email), gte(t.createdAt, dayAgo))),
  ]);
  return (byIp?.n ?? 0) >= 3 || (byEmail?.n ?? 0) >= 3;
}

export async function saveInquiry(input: InquiryInput, meta: { ipHash: string | null; userId: string | null }) {
  if (!db) throw new Error("Database not configured");
  const [row] = await db.insert(schema.partnerInquiries).values({
    name: input.name, email: input.email, organization: input.organization, website: input.website ?? null,
    kind: input.kind, interests: input.interests, parks: input.parks || null, budget: input.budget ?? null,
    message: input.message, ipHash: meta.ipHash, userId: meta.userId,
  }).returning({ id: schema.partnerInquiries.id });
  return row.id;
}

export async function listInquiries(status: InquiryStatus | "all" = "all") {
  if (!db) return [];
  const t = schema.partnerInquiries;
  const q = db.select().from(t).orderBy(desc(t.createdAt)).limit(500);
  return status === "all" ? q : q.where(eq(t.status, status));
}

export async function countNewInquiries(): Promise<number> {
  if (!db) return 0;
  const t = schema.partnerInquiries;
  const [r] = await db.select({ n: count() }).from(t).where(eq(t.status, "new"));
  return r?.n ?? 0;
}

export async function setInquiryStatus(id: string, status: InquiryStatus, actor: { id: string; email: string }) {
  if (!db) throw new Error("Database not configured");
  const t = schema.partnerInquiries;
  const [row] = await db.update(t).set({ status }).where(eq(t.id, id)).returning({ id: t.id, email: t.email });
  if (!row) throw new Error("Enquiry not found");
  await db.insert(schema.auditLog).values({ actorId: actor.id, actorEmail: actor.email, action: "partner.status", targetUserId: null, details: { inquiryId: id, email: row.email, status } });
}

/** Cloudflare Turnstile check, only when both keys are set (same keys as sign-in). */
export async function turnstileOk(token: string | null, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !process.env.TURNSTILE_SITE_KEY) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    return Boolean(((await r.json()) as { success?: boolean }).success);
  } catch {
    return false;
  }
}
