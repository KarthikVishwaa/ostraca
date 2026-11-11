/**
 * Security checks against a running app (npm run dev in another terminal). Uses one throw-away sale,
 * deleted at the end, and never calls Claude, OpenAI or a PayPal write.
 */
import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { pgSettings } from "../src/db/url";
import { aiKeys, AI_PER_IP_PER_HOUR, HOUR, windowStartMs } from "../src/lib/rate-keys";

const BASE = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ORIGIN = new URL(BASE).origin;
const HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);

type Row = { name: string; result: "PASS" | "FAIL" | "SKIP"; note: string };
const rows: Row[] = [];
const record = (name: string, ok: boolean, note = "") => rows.push({ name, result: ok ? "PASS" : "FAIL", note });
const skip = (name: string, note: string) => rows.push({ name, result: "SKIP", note });

function call(path: string, init: RequestInit & { origin?: string | null; ip?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.origin !== null) headers.set("Origin", init.origin ?? ORIGIN);
  if (init.ip) headers.set("X-Forwarded-For", init.ip);
  return fetch(BASE + path, { ...init, headers, redirect: "manual" });
}
const json = (path: string, method: string, body?: unknown, extra: { origin?: string | null; ip?: string } = {}) =>
  call(path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), ...extra });

const png = (extra = 64) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(extra)]);

function upload(txId: string, bytes: Buffer, type: string, mode: "manual" | "ai", ip?: string) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], "evidence.png", { type }));
  form.set("transactionId", txId);
  form.set("mode", mode);
  return call("/api/evidence", { method: "POST", body: form, ip });
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set.");
  const { connectionString, ssl } = pgSettings(dbUrl);
  const pg = new Client({ connectionString, ssl });
  await pg.connect();

  const stamp = Date.now();
  const testIp = `203.0.113.${1 + Math.floor(Math.random() * 250)}`; // documentation range, never a real client
  const bucketIp = HOPS === 0 ? "direct" : testIp;
  let txId = "";

  try {
    const up = await fetch(BASE + "/api/health").catch(() => null);
    if (!up) throw new Error(`The app is not running at ${BASE}. Start it first (npm run dev).`);

    txId = (
      await pg.query(`insert into transactions (paypal_order_id, paypal_capture_id, amount, currency, item_description) values ($1,$2,'10.00','USD','Security test item') returning id`, [`ORD-SEC-${stamp}`, `SECTEST-${stamp}`])
    ).rows[0].id as string;

    // Webhook: forged events are refused
    const wh = await json("/api/webhooks/paypal", "POST", { id: `WH-${randomUUID()}`, event_type: "CUSTOMER.DISPUTE.CREATED", resource: { dispute_id: "PP-R-FAKE-0001" } }, { origin: null });
    record("Forged webhook is refused (401, or 503 if no webhook ID is set)", wh.status === 401 || wh.status === 503, `HTTP ${wh.status}`);
    const wh2 = await call("/api/webhooks/paypal", { method: "POST", body: "not json", origin: null });
    record("Malformed webhook body is refused (400/401/503)", [400, 401, 503].includes(wh2.status), `HTTP ${wh2.status}`);

    // CSRF
    const c1 = await json("/api/limitation/events", "POST", { event: "export_print" }, { origin: "https://evil.example" });
    record("POST from a foreign Origin is blocked (403)", c1.status === 403, `HTTP ${c1.status}`);
    const c2 = await json("/api/limitation/events", "POST", { event: "export_print" }, { origin: null });
    record("POST with no Origin is blocked (403)", c2.status === 403, `HTTP ${c2.status}`);

    // Uploads
    const big = Buffer.concat([png(0), Buffer.alloc(9 * 1024 * 1024)]);
    const r1 = await upload(txId, big, "image/png", "manual", testIp);
    record("9 MB upload is rejected (413)", r1.status === 413, `HTTP ${r1.status}`);
    const r2 = await upload(txId, Buffer.from("<html><script>alert(1)</script></html> padding padding"), "image/png", "manual", testIp);
    record("HTML declared as image/png is rejected (415)", r2.status === 415, `HTTP ${r2.status}`);
    const r3 = await upload(txId, Buffer.from("MZ executable padding padding padding"), "application/pdf", "manual", testIp);
    record("Wrong-type file declared as PDF is rejected (415)", r3.status === 415, `HTTP ${r3.status}`);
    const r4 = await upload(txId, png(), "image/png", "manual", testIp);
    record("A valid PNG is accepted", r4.status === 200, `HTTP ${r4.status}`);

    // AI limit
    if (!process.env.ANTHROPIC_API_KEY) {
      skip("AI route answers 429 after the limit", "ANTHROPIC_API_KEY is not set, so the AI gate is never reached");
    } else {
      // Fill this test IP's hourly AI counter, then make one AI upload: it must be refused before any AI call is made.
      await pg.query(`insert into rate_limits (key, window_start, count) values ($1,$2,$3) on conflict (key, window_start) do update set count=$3`, [aiKeys.ipHour(bucketIp), new Date(windowStartMs(HOUR)), AI_PER_IP_PER_HOUR]);
      const r = await upload(txId, png(), "image/png", "ai", testIp);
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      record("AI upload answers 429 over the hourly limit", r.status === 429, `HTTP ${r.status}`);
      record("429 carries a Retry-After header and a friendly message", Number(r.headers.get("retry-after")) > 0 && !!body.error, `Retry-After ${r.headers.get("retry-after")}`);
      if (HOPS === 1) {
        // A client-written value on the LEFT of X-Forwarded-For must not change the bucket.
        const spoof = await upload(txId, png(), "image/png", "ai", `198.51.100.77, ${testIp}`);
        record("Faking X-Forwarded-For does not dodge the limit", spoof.status === 429, `HTTP ${spoof.status}`);
      } else {
        skip("Faking X-Forwarded-For does not dodge the limit", "only meaningful with TRUSTED_PROXY_HOPS=1");
      }
    }

    // Errors and headers
    const bad = await json("/api/evidence/manual", "POST", { transactionId: "not-a-uuid" });
    const badText = await bad.text();
    record("Bad input gets a plain 400 (no stack, SQL or zod dump)", bad.status === 400 && !/at \w+ \(|select |insert |ZodError|node_modules/i.test(badText), `HTTP ${bad.status}`);
    const health = await fetch(BASE + "/api/health");
    const healthBody = (await health.json().catch(() => ({}))) as Record<string, string>;
    record("/api/health only says ok or problem (no details)", Object.values(healthBody).every((v) => v === "ok" || v === "problem"), JSON.stringify(healthBody).slice(0, 80));
    const home = await fetch(BASE + "/");
    const h = home.headers;
    record("Security headers are present", !!(h.get("content-security-policy") || h.get("content-security-policy-report-only")) && h.get("x-content-type-options") === "nosniff" && !!h.get("referrer-policy") && !!h.get("permissions-policy"), "");
    record("Missing sale gives 404, not an error dump", (await call(`/api/transactions/${randomUUID()}`)).status === 404);
  } finally {
    try {
      if (txId) {
        const ev = (await pg.query(`select evidence_id from transaction_evidence where transaction_id=$1`, [txId])).rows.map((r) => r.evidence_id as string);
        await pg.query(`delete from agent_actions where transaction_id=$1`, [txId]);
        await pg.query(`delete from transactions where id=$1`, [txId]); // cascades to the evidence links
        if (ev.length) await pg.query(`delete from evidence where id = any($1)`, [ev]); // only the test sale's own uploads
      }
      await pg.query(`delete from rate_limits where key = any($1)`, [[aiKeys.ipHour(bucketIp), aiKeys.ipDay(bucketIp)]]);
    } finally {
      await pg.end();
    }
  }

  const w = Math.max(...rows.map((r) => r.name.length));
  console.log("\nSecurity test results\n" + "-".repeat(w + 14));
  for (const r of rows) console.log(`${r.result.padEnd(5)}  ${r.name.padEnd(w)}${r.note && r.result !== "PASS" ? `  (${r.note})` : ""}`);
  const failed = rows.filter((r) => r.result === "FAIL").length;
  console.log("-".repeat(w + 14));
  console.log(`${rows.filter((r) => r.result === "PASS").length} passed, ${failed} failed, ${rows.filter((r) => r.result === "SKIP").length} skipped. The test sale was deleted.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Test run could not finish:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
