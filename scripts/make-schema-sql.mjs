/**
 * Regenerates db/schema.sql (the one-command, safe-to-rerun table setup) from src/lib/db/schema.ts.
 *   npm run db:sql
 * Run after changing the schema; db/schema.sql is applied automatically before each build.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const raw = execSync("npx drizzle-kit export --sql", { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
let s = raw.replace(/--> statement-breakpoint/g, "")
  .replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "')
  .replace(/CREATE (UNIQUE )?INDEX "/g, (_m, u) => `CREATE ${u ?? ""}INDEX IF NOT EXISTS "`)
  .replace(/^(ALTER TABLE .*ADD CONSTRAINT .*;)$/gm, "BEGIN $1 EXCEPTION WHEN duplicate_object THEN NULL; END;");
const body = s.split("\n").filter((l) => l.trim()).map((l) => `  ${l.replace(/\t/g, "  ")}`).join("\n");
const out = `-- TrailsTV database tables.
-- Paste this whole file into the Neon console → SQL Editor and click Run.
-- It's written as ONE command so it works in any SQL editor, and it's safe to run
-- more than once: it only creates what's missing and never deletes anything.
-- Vercel also runs this automatically before each build when DATABASE_URL is set.
-- Regenerate after schema changes: npm run db:sql

DO $trailstv$
BEGIN
${body}
END
$trailstv$;
`;
fs.writeFileSync("db/schema.sql", out);
console.log(`Wrote db/schema.sql (${(out.match(/CREATE TABLE/g) ?? []).length} tables)`);
