/**
 * Read-only smoke test against the PayPal sandbox: token, list disputes, Transaction Search. Calls PayPal
 * directly and refuses to run unless PAYPAL_API_BASE is the sandbox.
 */
import "dotenv/config";

const base = (process.env.PAYPAL_API_BASE ?? "").replace(/\/$/, "");
const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;

type Row = { check: string; ok: boolean; detail: string };
const rows: Row[] = [];

async function main() {
  if (base !== "https://api-m.sandbox.paypal.com") {
    console.error(`Refusing to run: PAYPAL_API_BASE must be https://api-m.sandbox.paypal.com (it is "${base || "not set"}").`);
    process.exit(2);
  }
  if (!id || !secret) {
    console.error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env first.");
    process.exit(2);
  }

  let token = "";
  try {
    const r = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const b = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    token = b.access_token ?? "";
    rows.push({ check: "OAuth token", ok: r.ok && !!token, detail: r.ok ? `valid for ${b.expires_in}s` : `HTTP ${r.status} ${b.error_description ?? ""}` });
  } catch (e) {
    rows.push({ check: "OAuth token", ok: false, detail: `network error: ${(e as Error).message}` });
  }

  const get = async (check: string, path: string, summarize: (b: Record<string, unknown>) => string) => {
    if (!token) return void rows.push({ check, ok: false, detail: "skipped: no token" });
    try {
      const r = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
      const b = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      rows.push({ check, ok: r.ok, detail: r.ok ? summarize(b) : `HTTP ${r.status} ${String((b as { message?: string }).message ?? "")} debug_id ${String((b as { debug_id?: string }).debug_id ?? "-")}` });
    } catch (e) {
      rows.push({ check, ok: false, detail: `network error: ${(e as Error).message}` });
    }
  };

  await get("List disputes", "/v1/customer/disputes?page_size=5", (b) => `${(b.items as unknown[] | undefined)?.length ?? 0} dispute(s) listed`);
  const end = new Date();
  const start = new Date(end.getTime() - 3 * 864e5);
  const z = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  await get("Transaction Search (3 days)", `/v1/reporting/transactions?start_date=${z(start)}&end_date=${z(end)}&fields=transaction_info&page_size=5`, (b) => `${(b.transaction_details as unknown[] | undefined)?.length ?? 0} transaction(s), last refreshed ${String(b.last_refreshed_datetime ?? "n/a")}`);

  const w = Math.max(...rows.map((r) => r.check.length));
  console.log("\nLive PayPal sandbox smoke test\n" + "-".repeat(w + 50));
  for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.check.padEnd(w)}  ${r.detail}`);
  const bad = rows.filter((r) => !r.ok).length;
  console.log("-".repeat(w + 50) + `\n${rows.length - bad} passed, ${bad} failed.`);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => {
  console.error("Smoke test could not finish:", (e as Error).message);
  process.exit(1);
});
