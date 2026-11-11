import "server-only";
import type { Transaction } from "@/db/schema";
import { effectiveValue, isCounted, loadEvidence } from "@/lib/proof";
import { hasProof, type Fact } from "@/lib/validation/draft";

export type DisputeContext = {
  id: string;
  reason: string;
  created?: string;
  amount?: { value: string; currency_code: string };
};

const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

/**
 * Builds the numbered facts a dispute response may stand on. Only things the code verified or the seller
 * confirmed become facts; AI suggestions that nobody confirmed never do.
 */
export async function buildFacts(sale: Transaction, dispute: DisputeContext) {
  const facts: Fact[] = [];
  const add = (f: Omit<Fact, "id">) => facts.push({ ...f, id: `F${facts.length + 1}` });

  add({
    kind: "sale",
    text: `A payment of ${sale.amount} ${sale.currency}${sale.itemDescription ? ` for "${sale.itemDescription}"` : ""} was captured by PayPal on ${day(sale.capturedAt)} (capture ${sale.paypalCaptureId})`,
    tokens: [sale.paypalCaptureId, sale.paypalOrderId],
    dates: [day(sale.capturedAt)],
    amounts: [sale.amount],
  });
  add({
    kind: "dispute",
    text: `The buyer opened PayPal dispute ${dispute.id} (reason: ${dispute.reason.replace(/_/g, " ").toLowerCase()})${dispute.created ? ` on ${day(dispute.created)}` : ""}${dispute.amount ? ` for ${dispute.amount.value} ${dispute.amount.currency_code}` : ""}`,
    tokens: [dispute.id],
    dates: dispute.created ? [day(dispute.created)] : [],
    amounts: dispute.amount ? [dispute.amount.value] : [],
  });

  const items = await loadEvidence(sale.id);
  const counted = (field: string) => items.flatMap((i) => i.fields.filter((f) => f.field === field && isCounted(f)));
  const val = (f: { status: "verified" | "needs_review" | "rejected"; confirmedValue: string | null; aiValue: string | null }) => effectiveValue(f) ?? "";
  const how = (f: { status: string }) => (f.status === "verified" ? "verified by checks" : "confirmed by the seller");

  const tracking = counted("tracking_number")[0];
  const carrier = counted("carrier")[0];
  if (tracking) {
    const n = val(tracking);
    add({
      kind: "tracking",
      text: `The shipment has tracking number ${n}${carrier ? ` with carrier ${val(carrier)}` : ""} (${how(tracking)})`,
      tokens: [n],
    });
  }
  if (sale.trackingFiled) {
    add({ kind: "filed", text: `The tracking information was filed with PayPal on ${day(sale.trackingFiled)}`, dates: [day(sale.trackingFiled)] });
  }
  const ship = counted("date")[0];
  if (ship) add({ kind: "shipdate", text: `The shipment date on the record is ${val(ship)} (${how(ship)})`, dates: [val(ship)] });
  const city = counted("destination_city")[0];
  if (city) add({ kind: "city", text: `The shipping destination on the record is ${val(city)} (${how(city)})` });

  for (const e of items) {
    const isManual = e.mimeType === "application/json";
    if (e.kind === "delivery_photo") {
      add({ kind: "delivery", text: `A delivery photo is on file: ${e.fileName}, stored unchanged on ${day(e.uploadedAt)}`, dates: [day(e.uploadedAt)] });
    } else if (!isManual && e.fields.some(isCounted)) {
      add({
        kind: "evidence",
        text: `A ${e.kind.replace(/_/g, " ")} file (${e.fileName}) is stored unchanged on ${day(e.uploadedAt)}, SHA-256 ${e.sha256.slice(0, 12)}`,
        dates: [day(e.uploadedAt)],
      });
    }
  }

  const missing: string[] = [];
  if (!tracking) missing.push("A verified or confirmed tracking number");
  if (tracking && !carrier) missing.push("The carrier name");
  if (!ship) missing.push("A ship date");
  if (!items.some((i) => i.kind === "delivery_photo")) missing.push("Proof of delivery (for example a delivery photo)");
  if (tracking && !sale.trackingFiled) missing.push("Tracking filed with PayPal (do this on the sale page)");

  return {
    facts,
    missing,
    hasProof: hasProof(facts),
    tracking: tracking ? { trackingNumber: val(tracking), carrierName: carrier ? val(carrier) : null } : null,
    evidence: items,
  };
}
