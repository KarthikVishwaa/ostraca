import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Transaction, EvidenceExtraction } from "@/db/schema";
import { readiness } from "@/lib/readiness";

/**
 * Glue between stored evidence and the readiness score. No AI, no PayPal. Counting rule: a field supports
 * the score only if code verified it, or the seller confirmed/edited it. A `needs_review` field the seller
 * has not touched counts for nothing, and a `rejected` one never counts.
 */
export type Use = "hold" | "dispute" | "limitation";

type FieldLike = Pick<EvidenceExtraction, "status" | "confirmedValue" | "aiValue">;
export const isCounted = (f: FieldLike) =>
  f.status === "verified" || (f.status === "needs_review" && f.confirmedValue != null);
export const effectiveValue = (f: FieldLike) => f.confirmedValue ?? f.aiValue;

/** Evidence reuse: which uses one piece of evidence supports, decided by code from its counted fields. */
export function supportedUses(kind: string, counted: Set<string>): Use[] {
  const uses = new Set<Use>();
  if (counted.has("tracking_number")) ["hold", "dispute", "limitation"].forEach((u) => uses.add(u as Use));
  if (counted.has("amount") || kind === "invoice") (["dispute", "limitation"] as Use[]).forEach((u) => uses.add(u));
  if (["delivery_photo", "chat_screenshot", "voice_note"].includes(kind)) (["dispute", "limitation"] as Use[]).forEach((u) => uses.add(u));
  return (["hold", "dispute", "limitation"] as Use[]).filter((u) => uses.has(u));
}

export async function loadEvidence(transactionId: string) {
  const links = await db()
    .select({ ev: schema.evidence, link: schema.transactionEvidence })
    .from(schema.transactionEvidence)
    .innerJoin(schema.evidence, eq(schema.evidence.id, schema.transactionEvidence.evidenceId))
    .where(eq(schema.transactionEvidence.transactionId, transactionId))
    .orderBy(desc(schema.evidence.uploadedAt));
  const ids = links.map((l) => l.ev.id);
  const fields = ids.length
    ? await db().select().from(schema.evidenceExtractions).where(inArray(schema.evidenceExtractions.evidenceId, ids))
    : [];
  return links.map(({ ev, link }) => {
    const { content: _content, ...meta } = ev; // never ship the file bytes in JSON
    return { ...meta, usedFor: link.usedFor, fields: fields.filter((f) => f.evidenceId === ev.id) };
  });
}

/** Recompute the readiness score from what is stored now, save it on the transaction, and refresh each item's uses. */
export async function recomputeReadiness(transactionId: string) {
  const [tx] = await db().select().from(schema.transactions).where(eq(schema.transactions.id, transactionId));
  if (!tx) throw new Error("transaction not found");
  const items = await loadEvidence(transactionId);

  const counted = new Set<string>();
  for (const item of items) {
    const own = new Set(item.fields.filter(isCounted).map((f) => f.field));
    own.forEach((f) => counted.add(f));
    const uses = supportedUses(item.kind, own);
    if (JSON.stringify(uses) !== JSON.stringify(item.usedFor)) {
      await db()
        .update(schema.transactionEvidence)
        .set({ usedFor: uses })
        .where(and(eq(schema.transactionEvidence.transactionId, transactionId), eq(schema.transactionEvidence.evidenceId, item.id)));
    }
  }

  const result = readiness({
    trackingFiled: tx.trackingFiled != null,
    hasVerifiedTracking: counted.has("tracking_number"),
    hasDeliveryProof: items.some((i) => i.kind === "delivery_photo"),
    amountReconciled: counted.has("amount"),
    // "Matched" means code matched it to the PayPal order. A value the seller merely confirmed
    // (for example when PayPal sent no city) is not a match.
    buyerOrCityMatched: items.some((i) => i.fields.some((f) => ["buyer_name", "destination_city"].includes(f.field) && f.status === "verified")),
    isService: false,
    hasInvoice: items.some((i) => i.kind === "invoice"),
  });
  await db().update(schema.transactions).set({ readinessScore: result.score }).where(eq(schema.transactions.id, transactionId));
  return result;
}

/** The context deterministic checks compare evidence against. */
export const captureContext = (tx: Transaction) => ({
  amount: tx.amount,
  currency: tx.currency,
  capturedAt: tx.capturedAt,
  buyerName: tx.buyerName,
  shipToCity: tx.shipToCity,
});

/** Best tracking number + carrier the seller can stand behind, for the approval request. */
export async function confirmedTracking(transactionId: string) {
  const items = await loadEvidence(transactionId);
  const all = items.flatMap((i) => i.fields.filter(isCounted));
  const t = all.find((f) => f.field === "tracking_number");
  const c = all.find((f) => f.field === "carrier");
  return { trackingNumber: t ? effectiveValue(t) : null, carrier: c ? effectiveValue(c) : null };
}
