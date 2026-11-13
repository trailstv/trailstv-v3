import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "./db";

/**
 * Addresses allowed to sign in. Covers your domain with and without "www", Vercel's own
 * *.vercel.app addresses (production, branch and preview deploys) and anything extra in
 * TRUSTED_ORIGINS (comma-separated). Without this, Better Auth answers "Invalid origin".
 */
export function trustedOrigins(): string[] {
  const out = new Set<string>();
  const add = (v?: string) => {
    for (const raw of (v ?? "").split(",")) {
      const t = raw.trim().replace(/\/+$/, "");
      if (!t) continue;
      try {
        const u = new URL(/^https?:\/\//.test(t) ? t : `https://${t}`);
        out.add(u.origin);
        const alt = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
        if (!/^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(u.hostname) && !u.hostname.endsWith(".vercel.app")) out.add(`${u.protocol}//${alt}${u.port ? `:${u.port}` : ""}`);
      } catch { /* ignore malformed entries */ }
    }
  };
  add(process.env.BETTER_AUTH_URL);
  add(process.env.NEXT_PUBLIC_SITE_URL);
  add(process.env.TRUSTED_ORIGINS);
  add(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  add(process.env.VERCEL_BRANCH_URL);
  add(process.env.VERCEL_URL);
  if (process.env.NODE_ENV !== "production") add("http://localhost:3000");
  return [...out];
}

function createAuth() {
  if (!db) throw new Error("DATABASE_URL not configured");
  const google =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
      : {};

  return betterAuth({
    appName: "TrailsTV",
    trustedOrigins: trustedOrigins(),
    // BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from the environment.
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
      transaction: false, // Neon HTTP driver: no interactive transactions
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    user: {
      additionalFields: {
        // input:false → can never be set by the client at sign-up or profile update.
        role: { type: "string", defaultValue: "user", input: false },
      },
    },
    socialProviders: google,
    session: { expiresIn: 60 * 60 * 24 * 30, cookieCache: { enabled: true, maxAge: 300 } },
    plugins: [nextCookies()], // must be last
  });
}

let _auth: ReturnType<typeof createAuth> | null = null;
/** Lazy so `next build` works without a database. */
export function getAuth() {
  return (_auth ??= createAuth());
}

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export type SessionUser = { id: string; name: string; email: string; image?: string | null; role: "user" | "admin" };

/** Bootstrap admins by email (comma-separated), e.g. ADMIN_EMAILS=you@example.com */
const adminEmails = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/** Current signed-in user (deduped per request), or null. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  if (!db) return null;
  try {
    const s = await getAuth().api.getSession({ headers: await headers() });
    if (!s?.user) return null;
    const u = s.user as typeof s.user & { role?: string };
    const role = u.role === "admin" || adminEmails().includes(u.email.toLowerCase()) ? "admin" : "user";
    return { id: u.id, name: u.name, email: u.email, image: u.image, role };
  } catch {
    return null;
  }
});
