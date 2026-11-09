// Raw Postgres connection test, without drizzle wrapping the error.
// Usage: node scripts/db-test.mjs   (reads DATABASE_URL from .env; never prints the password)
import "dotenv/config";
import pg from "pg";

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}

let url;
try {
  url = new URL(raw);
} catch (e) {
  console.error("DATABASE_URL is not a valid URL:", e.message, "(check for quotes or unencoded special characters)");
  process.exit(1);
}

console.log("host:    ", url.hostname, url.hostname.includes("-pooler") ? "(Neon pooled)" : "");
console.log("database:", url.pathname.slice(1));
console.log("user:    ", url.username || "(none)", "| password set:", url.password ? "yes" : "no");
console.log("params:  ", url.search || "(none)");

if (url.hostname === "host" || url.pathname === "/dbname") {
  console.warn("\n!! This is the placeholder from .env.example. Paste your real Neon connection string.\n");
}

const client = new pg.Client({ connectionString: raw, connectionTimeoutMillis: 15000 });
const started = Date.now();
try {
  await client.connect();
  const r = await client.query("select version(), current_database()");
  console.log(`\nOK in ${Date.now() - started}ms:`, r.rows[0].current_database, "|", r.rows[0].version.split(",")[0]);
  const t = await client.query("select count(*)::int as n from information_schema.tables where table_schema='public'");
  console.log("public tables:", t.rows[0].n);
} catch (e) {
  console.error(`\nFAILED after ${Date.now() - started}ms`);
  console.error("  message:", e.message);
  if (e.code) console.error("  code:   ", e.code);
  if (e.cause) console.error("  cause:  ", e.cause.message ?? e.cause);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
