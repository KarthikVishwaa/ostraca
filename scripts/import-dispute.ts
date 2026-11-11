/**
 * Imports one existing PayPal sandbox dispute and its sale:  npm run import:dispute -- PP-R-SAK-10197364
 * Reads the dispute, its capture and the order from PayPal, creates the sale if it is missing, links the dispute
 * to it, and records both imports in the audit log. Only values PayPal returns are stored; a missing field stays
 * empty. Nothing is written to PayPal. Runs with `--conditions react-server` so the server-only modules load.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";
import { DISPUTE_IMPORT_EVENT, importedDisputeIds } from "@/lib/data-reset";
import { syncDispute } from "@/lib/disputes-sync";
import { hasLink, paypal, PayPalError } from "@/lib/paypal/client";
import { getDispute } from "@/lib/paypal/disputes";

const SALE_IMPORT_EVENT = "sale imported from PayPal";

type Capture = {
  id: string;
  status?: string;
  amount?: { value?: string; currency_code?: string };
  create_time?: string;
  links?: Array<{ rel: string; href: string }>;
  supplementary_data?: { related_ids?: { order_id?: string } };
};
type Order = {
  id: string;
  payer?: { name?: { given_name?: string; surname?: string }; email_address?: string };
  purchase_units?: Array<{ description?: string; shipping?: { address?: { admin_area_2?: string; country_code?: string } } }>;
};

const say = (s = "") => console.log(s);
const fail = (msg: string): never => {
  console.error(`\n${msg}`);
  process.exit(1);
};
const lookup = async <T>(path: string): Promise<T | null> => {
  try {
    return await paypal<T>(path);
  } catch (e) {
    if (e instanceof PayPalError && [404, 400, 403].includes(e.status)) return null; // not available from PayPal: leave the fields empty
    throw e;
  }
};

async function main() {
  const id = process.argv[2];
  if (!id || !/^[A-Za-z0-9-]{6,40}$/.test(id)) fail("Usage: npm run import:dispute -- PP-R-XXX-12345678");
  if (!/^https:\/\/api-m\.sandbox\.paypal\.com\/?$/.test(process.env.PAYPAL_API_BASE ?? "")) {
    fail(`Refusing to run: PAYPAL_API_BASE must be https://api-m.sandbox.paypal.com (it is "${process.env.PAYPAL_API_BASE ?? "not set"}").`);
  }

  // 1. the dispute
  let detail;
  try {
    detail = await getDispute(id);
  } catch (e) {
    if (e instanceof PayPalError && e.status === 404) fail(`PayPal has no dispute ${id} (it was deleted, or it belongs to another merchant account). Nothing was imported.`);
    throw e;
  }
  const disp = detail as typeof detail & {
    disputed_transactions?: Array<{
      seller_transaction_id?: string;
      create_time?: string;
      transaction_status?: string;
      gross_amount?: { value?: string; currency_code?: string };
      buyer?: { name?: string };
      items?: Array<{ item_description?: string; item_name?: string }>;
    }>;
  };
  const txn = disp.disputed_transactions?.[0];
  const captureId = txn?.seller_transaction_id;
  if (!captureId) fail(`Dispute ${id} does not name a seller transaction, so there is no sale to import.`);

  // 2. the capture and its order
  const capture = await lookup<Capture>(`/v2/payments/captures/${encodeURIComponent(captureId!)}`);
  const orderId = capture?.supplementary_data?.related_ids?.order_id ?? capture?.links?.find((l) => l.rel === "up")?.href.split("/").pop();
  const order = orderId ? await lookup<Order>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`) : null;

  const unit = order?.purchase_units?.[0];
  const amount = capture?.amount?.value ?? txn?.gross_amount?.value;
  const currency = capture?.amount?.currency_code ?? txn?.gross_amount?.currency_code;
  if (!amount || !currency) fail(`PayPal returned no amount for capture ${captureId}, so the sale cannot be stored. Nothing was imported.`);
  const buyerName = [order?.payer?.name?.given_name, order?.payer?.name?.surname].filter(Boolean).join(" ") || txn?.buyer?.name || null;
  const item = unit?.description ?? txn?.items?.[0]?.item_description ?? txn?.items?.[0]?.item_name ?? null;
  const createdAt = capture?.create_time ?? txn?.create_time;
  const status = capture?.status ?? txn?.transaction_status;

  // 3. the sale (same table and fields as a normally captured sale)
  let [sale] = await db().select().from(schema.transactions).where(eq(schema.transactions.paypalCaptureId, captureId!));
  let createdSale = false;
  if (!sale) {
    [sale] = await db()
      .insert(schema.transactions)
      .values({
        sellerId: "demo-seller",
        paypalOrderId: orderId ?? "", // empty when PayPal does not return the order
        paypalCaptureId: captureId!,
        amount: amount!,
        currency: currency!,
        buyerName,
        buyerEmail: order?.payer?.email_address ?? null,
        shipToCity: unit?.shipping?.address?.admin_area_2 ?? null,
        shipToCountry: unit?.shipping?.address?.country_code ?? null,
        itemDescription: item,
        ...(status ? { status } : {}),
        ...(createdAt ? { capturedAt: new Date(createdAt) } : {}),
      })
      .returning();
    createdSale = true;
    await audit("system", SALE_IMPORT_EVENT, { type: "transaction", id: sale.id }, { captureId, orderId: orderId ?? null, disputeId: id });
  }

  // 4. the dispute. The audit event goes first: it is what keeps the data-reset filter from hiding it.
  const alreadyImported = (await importedDisputeIds([id])).has(id);
  if (!alreadyImported) await audit("system", DISPUTE_IMPORT_EVENT, { type: "dispute", id }, { disputeId: id, captureId, transactionId: sale.id });
  const synced = await syncDispute(id);

  // 5. summary
  const d = synced.detail;
  const closed = d.status === "RESOLVED" || d.dispute_state === "RESOLVED" || !!d.dispute_outcome?.outcome_code;
  const canEvidence = hasLink(d.links, "provide_evidence");
  say("Imported from the PayPal sandbox\n");
  say(`Sale            ${sale.id}  (${createdSale ? "created now" : "was already in the database"})`);
  say(`Capture ID      ${sale.paypalCaptureId}`);
  say(`Order ID        ${sale.paypalOrderId || "not returned by PayPal"}`);
  say(`Amount          ${sale.amount} ${sale.currency}`);
  say(`Buyer           ${sale.buyerName ?? "not returned by PayPal"}`);
  say(`Ship-to city    ${sale.shipToCity ?? "not returned by PayPal"}`);
  say(`Item            ${sale.itemDescription ?? "not returned by PayPal"}`);
  say(`Captured        ${sale.capturedAt.toISOString()}`);
  say();
  say(`Dispute         ${d.dispute_id}`);
  say(`Reason          ${d.reason ?? "-"}`);
  say(`Status          ${d.status}${d.dispute_state ? ` (state ${d.dispute_state})` : ""}`);
  say(`Stage           ${d.dispute_life_cycle_stage ?? "not returned by PayPal"}`);
  say(`Respond by      ${d.seller_response_due_date ?? "-"}`);
  say(`Outcome         ${d.dispute_outcome?.outcome_code ?? "none yet"}`);
  say(`Evidence        ${canEvidence ? "PayPal offers provide_evidence right now: the seller can submit evidence" : "PayPal does not offer provide_evidence right now: evidence cannot be submitted"}`);
  if (closed) say("\nThis dispute is closed (resolved) on PayPal's side.");
  if (!createdSale) say("\nThe sale was already stored, so it was left as it is.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Import failed:", e instanceof PayPalError ? `${e.message}${e.debugId ? ` (PayPal debug_id ${e.debugId})` : ""}` : e instanceof Error ? e.message : String(e));
  process.exit(1);
});
