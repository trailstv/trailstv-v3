/**
 * Creates any missing database tables by running db/schema.sql against DATABASE_URL.
 * Safe to run any number of times: it only creates what's missing and never deletes.
 *   node scripts/db-setup.mjs      (also runs automatically before every build)
 */
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) { console.log("· DATABASE_URL not set: skipping database setup."); process.exit(0); }
const sqlText = fs.readFileSync(path.join(process.cwd(), "db/schema.sql"), "utf8");
try {
  const sql = neon(url);
  await sql.query(sqlText);
  const [{ n }] = await sql.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
  console.log(`✓ Database ready (${n} tables).`);
} catch (e) {
  console.warn(`⚠ Database setup failed: ${e.message}`);
  process.exitCode = 0; // don't block the deploy; pages show a clear message instead
}
