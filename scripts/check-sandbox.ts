/**
 * Sandbox readiness check, run before building features: PayPal auth, the Disputes API, and the tracking-
 * number validator.
 */
import "dotenv/config";

const base = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";
const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;

async function main() {
  if (!base.includes("sandbox")) throw new Error("Refusing to run against non-sandbox PayPal.");
  if (!id || !secret) throw new Error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env first.");

  const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const tok = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`Auth failed: ${JSON.stringify(tok)}`);
  console.log("✅ 1/3 PayPal sandbox auth OK");

  const dRes = await fetch(`${base}/v1/customer/disputes?page_size=10`, {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  const d = await dRes.json();
  if (!dRes.ok) {
    console.log(`❌ 2/3 Disputes API: ${dRes.status} ${d.name ?? ""} ${d.message ?? ""}`);
    console.log("   → In the Developer Dashboard, open your app and make sure Disputes is enabled.");
  } else {
    const items: Array<{ dispute_id: string; status: string; reason: string }> = d.items ?? [];
    console.log(`✅ 2/3 Disputes API OK — ${items.length} dispute(s) found`);
    for (const it of items) console.log(`   • ${it.dispute_id}  ${it.status}  ${it.reason}`);
    if (!items.length) console.log("   (None yet. Pay on /store as the sandbox buyer, then report a problem at sandbox.paypal.com.)");
  }

  const { checkTracking } = await import("../src/lib/validation/tracking");
  const good = checkTracking("EE123456785IN");
  const bad = checkTracking("EE123456789IN");
  const ok = good.result === "valid_checksum" && bad.result === "invalid";
  console.log(`${ok ? "✅" : "❌"} 3/3 Tracking validator: ${good.note} / ${bad.note}`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
