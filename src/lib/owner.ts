/**
 * Site owner: always an admin, and their admin role can't be removed from the dashboard.
 * Override with OWNER_EMAIL in Vercel if the owner address ever changes.
 */
export const OWNER_EMAIL = (process.env.OWNER_EMAIL || "trailstv@gmail.com").trim().toLowerCase();

export const isOwnerEmail = (email?: string | null) => !!email && email.trim().toLowerCase() === OWNER_EMAIL;

/** Owner + anyone listed in ADMIN_EMAILS (comma-separated) is an admin automatically. */
export const adminEmails = () => [OWNER_EMAIL, ...(process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)];
