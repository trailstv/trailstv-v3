import "server-only";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { and, count, desc, eq, ilike, inArray, isNull, or, sql, gt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import { getUser, type SessionUser } from "./auth";
import { getPark } from "./content";
import { customerIdForUser, getUserEntitlements } from "./billing";

/* --------------------------------- Guards --------------------------------- */

const adminEmails = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/**
 * Re-checks the role in the database on every admin request (not the 5-minute
 * session cache), so removing someone's admin role takes effect immediately.
 */
async function currentAdmin(): Promise<SessionUser | null> {
  if (!db) return null;
  const user = await getUser();
  if (!user) return null;
  const [row] = await db.select({ role: schema.user.role }).from(schema.user).where(eq(schema.user.id, user.id)).limit(1);
  if (row?.role === "admin") return { ...user, role: "admin" };
  if (adminEmails().includes(user.email.toLowerCase())) {
    // Bootstrap: persist the role so the Admin link shows in the menu.
    await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, user.id));
    return { ...user, role: "admin" };
  }
  return null;
}

/** For admin pages: non-admins get a plain 404 (the admin area doesn't advertise itself). */
export async function requireAdminPage(): Promise<SessionUser> {
  const admin = await currentAdmin();
  if (!admin) notFound();
  return admin;
}

/** For admin route handlers: same check, plus a same-origin check on writes. */
export async function requireAdminRoute(req: Request): Promise<SessionUser | NextResponse> {
  const origin = req.headers.get("origin");
  if (req.method !== "GET" && origin && origin !== new URL(req.url).origin && origin !== process.env.NEXT_PUBLIC_SITE_URL) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const admin = await currentAdmin();
  return admin ?? NextResponse.json({ error: "Not found" }, { status: 404 });
}

async function audit(actor: SessionUser, action: string, targetUserId: string | null, details: Record<string, unknown>) {
  await db!.insert(schema.auditLog).values({ actorId: actor.id, actorEmail: actor.email, action, targetUserId, details });
}

/* --------------------------------- Grants --------------------------------- */

export const GRANT_DURATIONS = {
  "7d": { label: "7 days", days: 7 },
  "30d": { label: "1 month", days: 30 },
  "90d": { label: "3 months", days: 90 },
  "180d": { label: "6 months", days: 180 },
  "365d": { label: "1 year", days: 365 },
  forever: { label: "Never expires", days: null },
  custom: { label: "Until a specific date…", days: null },
} as const;

export const GrantInput = z
  .object({
    userId: z.string().min(1),
    grant: z.enum(["plus", "park-pack"]),
    parkCode: z.string().optional(),
    duration: z.enum(Object.keys(GRANT_DURATIONS) as [keyof typeof GRANT_DURATIONS, ...(keyof typeof GRANT_DURATIONS)[]]),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((g) => g.grant !== "park-pack" || (g.parkCode && getPark(g.parkCode)), { message: "Choose a valid park", path: ["parkCode"] })
  .refine((g) => g.duration !== "custom" || (g.until && Date.parse(g.until) > Date.now()), { message: "Pick a future end date", path: ["until"] });

export async function createGrant(actor: SessionUser, input: z.infer<typeof GrantInput>) {
  const [target] = await db!.select({ id: schema.user.id, email: schema.user.email }).from(schema.user).where(eq(schema.user.id, input.userId)).limit(1);
  if (!target) throw new Error("User not found");
  const d = GRANT_DURATIONS[input.duration];
  const expiresAt =
    input.duration === "custom" ? new Date(input.until! + "T23:59:59") : d.days ? new Date(Date.now() + d.days * 86400000) : null;
  const [row] = await db!
    .insert(schema.accessGrants)
    .values({ userId: target.id, grant: input.grant, parkCode: input.grant === "park-pack" ? input.parkCode! : null, expiresAt, note: input.note || null, grantedBy: actor.id })
    .returning();
  await audit(actor, "grant.create", target.id, { grantId: row.id, grant: row.grant, parkCode: row.parkCode, expiresAt, note: row.note, email: target.email });
  return row;
}

export async function revokeGrant(actor: SessionUser, grantId: string) {
  const [row] = await db!
    .update(schema.accessGrants)
    .set({ revokedAt: new Date(), revokedBy: actor.id })
    .where(and(eq(schema.accessGrants.id, grantId), isNull(schema.accessGrants.revokedAt)))
    .returning();
  if (row) await audit(actor, "grant.revoke", row.userId, { grantId, grant: row.grant, parkCode: row.parkCode });
  return row ?? null;
}

/* ---------------------------------- Roles ---------------------------------- */

export async function setRole(actor: SessionUser, userId: string, role: "user" | "admin") {
  if (actor.id === userId && role !== "admin") throw new Error("You can't remove your own admin role");
  const [row] = await db!.update(schema.user).set({ role, updatedAt: new Date() }).where(eq(schema.user.id, userId)).returning({ id: schema.user.id, email: schema.user.email });
  if (!row) throw new Error("User not found");
  await audit(actor, "role.set", userId, { role, email: row.email });
  return row;
}

/* --------------------------------- Queries --------------------------------- */

const activeGrantWhere = () =>
  and(isNull(schema.accessGrants.revokedAt), or(isNull(schema.accessGrants.expiresAt), gt(schema.accessGrants.expiresAt, new Date())));

export async function adminStats() {
  const [[users], [newUsers], [paidPlus], [compPlus], [packs], [compPacks], recent] = await Promise.all([
    db!.select({ n: count() }).from(schema.user),
    db!.select({ n: count() }).from(schema.user).where(gt(schema.user.createdAt, new Date(Date.now() - 30 * 86400000))),
    db!.select({ n: count() }).from(schema.subscriptions).where(inArray(schema.subscriptions.status, ["active", "trialing"])),
    db!.select({ n: sql<number>`count(distinct ${schema.accessGrants.userId})::int` }).from(schema.accessGrants).where(and(eq(schema.accessGrants.grant, "plus"), activeGrantWhere())),
    db!.select({ n: count(), cents: sql<number>`coalesce(sum(${schema.purchases.amountTotal}),0)::int` }).from(schema.purchases).where(eq(schema.purchases.refunded, false)),
    db!.select({ n: count() }).from(schema.accessGrants).where(and(eq(schema.accessGrants.grant, "park-pack"), activeGrantWhere())),
    db!.select({ id: schema.user.id, name: schema.user.name, email: schema.user.email, createdAt: schema.user.createdAt }).from(schema.user).orderBy(desc(schema.user.createdAt)).limit(8),
  ]);
  return { users: users.n, newUsers30d: newUsers.n, paidPlus: paidPlus.n, compPlus: compPlus.n, packsSold: packs.n, packRevenueCents: packs.cents, compPacks: compPacks.n, recent };
}

export async function searchUsers(q: string, page = 0, pageSize = 50) {
  const where = q ? or(ilike(schema.user.email, `%${q}%`), ilike(schema.user.name, `%${q}%`)) : undefined;
  const rows = await db!
    .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email, role: schema.user.role, createdAt: schema.user.createdAt })
    .from(schema.user)
    .where(where)
    .orderBy(desc(schema.user.createdAt))
    .limit(pageSize + 1)
    .offset(page * pageSize);
  // Plan badges in one batch.
  const ids = rows.map((r) => r.id);
  const [grants, subs] = ids.length
    ? await Promise.all([
        db!.select({ userId: schema.accessGrants.userId, grant: schema.accessGrants.grant }).from(schema.accessGrants).where(and(inArray(schema.accessGrants.userId, ids), activeGrantWhere())),
        db!.select({ userId: schema.customers.userId }).from(schema.customers)
          .innerJoin(schema.subscriptions, eq(schema.subscriptions.stripeCustomerId, schema.customers.stripeCustomerId))
          .where(and(inArray(schema.customers.userId, ids), inArray(schema.subscriptions.status, ["active", "trialing"]))),
      ])
    : [[], []];
  return {
    hasMore: rows.length > pageSize,
    users: rows.slice(0, pageSize).map((u) => ({
      ...u,
      paidPlus: subs.some((s) => s.userId === u.id),
      compPlus: grants.some((g) => g.userId === u.id && g.grant === "plus"),
      compPacks: grants.filter((g) => g.userId === u.id && g.grant === "park-pack").length,
    })),
  };
}

export async function getUserDetail(userId: string) {
  const [u] = await db!.select().from(schema.user).where(eq(schema.user.id, userId)).limit(1);
  if (!u) return null;
  const customerId = await customerIdForUser(userId);
  const [ent, grants, subs, purchases, log, counts] = await Promise.all([
    getUserEntitlements(userId),
    db!.select().from(schema.accessGrants).where(eq(schema.accessGrants.userId, userId)).orderBy(desc(schema.accessGrants.createdAt)),
    customerId ? db!.select().from(schema.subscriptions).where(eq(schema.subscriptions.stripeCustomerId, customerId)) : Promise.resolve([]),
    customerId ? db!.select().from(schema.purchases).where(eq(schema.purchases.stripeCustomerId, customerId)).orderBy(desc(schema.purchases.createdAt)) : Promise.resolve([]),
    db!.select().from(schema.auditLog).where(eq(schema.auditLog.targetUserId, userId)).orderBy(desc(schema.auditLog.createdAt)).limit(30),
    db!.select({
      trips: sql<number>`(select count(*)::int from trips where user_id = ${userId})`,
      completions: sql<number>`(select count(*)::int from completions where user_id = ${userId})`,
      reports: sql<number>`(select count(*)::int from trip_reports where user_id = ${userId})`,
    }).from(schema.user).where(eq(schema.user.id, userId)),
  ]);
  return { user: u, customerId, ent, grants, subs, purchases, log, counts: counts[0] };
}

export async function listGrants(filter: "active" | "all") {
  return db!
    .select({ grant: schema.accessGrants, email: schema.user.email, name: schema.user.name })
    .from(schema.accessGrants)
    .innerJoin(schema.user, eq(schema.user.id, schema.accessGrants.userId))
    .where(filter === "active" ? activeGrantWhere() : undefined)
    .orderBy(desc(schema.accessGrants.createdAt))
    .limit(500);
}

export async function listAudit(limit = 200) {
  return db!.select().from(schema.auditLog).orderBy(desc(schema.auditLog.createdAt)).limit(limit);
}
