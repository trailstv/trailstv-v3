import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Neon serverless HTTP driver – ideal for Vercel Functions (no pooled TCP
 * connections). Returns null when DATABASE_URL isn't set so the site still
 * builds and renders from flat files alone.
 */
export const db = process.env.DATABASE_URL ? drizzle(neon(process.env.DATABASE_URL), { schema }) : null;

export { schema };
