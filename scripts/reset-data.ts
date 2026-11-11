/**
 * Safe reset of the Ostraca data (sandbox only).
 *
 *   npm run db:reset            shows what it WOULD delete, with row counts, and exits
 *   npm run db:reset -- --yes   actually deletes it
 *
 * It refuses to run unless PAYPAL_API_BASE is the PayPal sandbox. After clearing, it writes ONE audit
 * row, event "data_reset". Disputes that PayPal created before that moment are then ignored by the app,
 * so old sandbox disputes that PayPal still holds do not come back.
 */
import "dotenv/config";
import { Client } from "pg";
import { pgSettings } from "../src/db/url";

// Children first, so foreign keys are respected even without CASCADE. Keep in step with src/db/schema.ts.
const TABLES = ["transaction_evidence", "evidence_extractions", "evidence", "agent_actions", "disputes", "transactions", "audit_logs"] as const;
const RESET_EVENT = "data_reset"; // same string as src/lib/data-reset.ts

async function main() {
  const base = process.env.PAYPAL_API_BASE ?? "";
  const url = process.env.DATABASE_URL;
  const yes = process.argv.includes("--yes");

  if (!/^https:\/\/api-m\.sandbox\.paypal\.com\/?$/.test(base)) {
    console.error(`Refusing to run: PAYPAL_API_BASE must be https://api-m.sandbox.paypal.com (it is "${base || "not set"}"). Nothing was touched.`);
    process.exit(1);
  }
  if (!url) {
    console.error("Refusing to run: DATABASE_URL is not set.");
    process.exit(1);
  }

  const { connectionString, ssl } = pgSettings(url);
  const client = new Client({ connectionString, ssl, connectionTimeoutMillis: 15_000 });
  await client.connect();
  try {
    const counts: Record<string, number> = {};
    for (const t of TABLES) counts[t] = (await client.query(`select count(*)::int as n from "${t}"`)).rows[0].n;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    console.log(yes ? "Deleting everything below:\n" : "DRY RUN. This would delete:\n");
    for (const t of TABLES) console.log(`  ${t.padEnd(22)} ${String(counts[t]).padStart(6)} row(s)`);
    console.log(`  ${"total".padEnd(22)} ${String(total).padStart(6)} row(s)`);
    console.log(`\nThen it would write one audit_logs row: event "${RESET_EVENT}", actor "system".`);
    console.log("PayPal itself is not touched; disputes PayPal created before the reset are ignored by the app afterwards.");

    if (!yes) {
      console.log("\nNothing was deleted. To really do it, run:  npm run db:reset -- --yes");
      return;
    }

    await client.query("begin");
    try {
      await client.query(`truncate table ${TABLES.map((t) => `"${t}"`).join(", ")} restart identity cascade`);
      await client.query(`insert into audit_logs (actor, event, entity_type, details) values ('system', $1, 'system', $2)`, [
        RESET_EVENT,
        JSON.stringify({ at: new Date().toISOString(), cleared: counts }),
      ]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
    console.log(`\nDone. Cleared ${total} row(s) and recorded "${RESET_EVENT}" at ${new Date().toISOString()}.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("Reset failed:", e?.message ?? e);
  process.exit(1);
});
