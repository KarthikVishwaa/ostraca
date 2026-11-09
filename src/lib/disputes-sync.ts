import "server-only";
import { eq } from "drizzle-orm";
import { getDispute } from "@/lib/paypal/disputes";
import { db, schema } from "@/db";

/** Re-reads a dispute from PayPal and upserts it. Status always comes from PayPal. */
export async function syncDispute(disputeId: string) {
  const d = await getDispute(disputeId);
  const sellerTxnId = d.disputed_transactions?.[0]?.seller_transaction_id;
  const tx = sellerTxnId
    ? (await db().select().from(schema.transactions).where(eq(schema.transactions.paypalCaptureId, sellerTxnId)))[0]
    : undefined;

  const values = {
    paypalDisputeId: d.dispute_id,
    transactionId: tx?.id ?? null,
    reason: d.reason,
    status: d.status,
    stage: d.dispute_life_cycle_stage ?? null,
    outcome: d.dispute_outcome?.outcome_code ?? null,
    amount: d.dispute_amount?.value ?? null,
    currency: d.dispute_amount?.currency_code ?? null,
    raw: d as unknown as Record<string, unknown>,
    lastSyncedAt: new Date(),
  };
  await db()
    .insert(schema.disputes)
    .values(values)
    .onConflictDoUpdate({ target: schema.disputes.paypalDisputeId, set: values });
  return d;
}
