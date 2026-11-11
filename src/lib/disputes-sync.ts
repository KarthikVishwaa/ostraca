import "server-only";
import { eq } from "drizzle-orm";
import { getDispute } from "@/lib/paypal/disputes";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";
import { DisputeIgnoredError, importedDisputeIds, latestResetAt, predatesReset } from "@/lib/data-reset";

/** Re-reads a dispute from PayPal and upserts it. Status always comes from PayPal, never from us. */
export async function syncDispute(disputeId: string) {
  const detail = await getDispute(disputeId);
  // Old sandbox disputes that PayPal still holds must not come back after a data reset.
  if (predatesReset(detail.create_time, await latestResetAt()) && !(await importedDisputeIds([detail.dispute_id])).has(detail.dispute_id)) {
    throw new DisputeIgnoredError(detail.dispute_id);
  }
  const sellerTxnId = detail.disputed_transactions?.find((t) => t.seller_transaction_id)?.seller_transaction_id;
  const sale = sellerTxnId
    ? (await db().select().from(schema.transactions).where(eq(schema.transactions.paypalCaptureId, sellerTxnId)))[0]
    : undefined;

  const [prev] = await db().select().from(schema.disputes).where(eq(schema.disputes.paypalDisputeId, detail.dispute_id));
  const values = {
    paypalDisputeId: detail.dispute_id,
    transactionId: sale?.id ?? null,
    reason: detail.reason,
    status: detail.status,
    stage: detail.dispute_life_cycle_stage ?? null,
    outcome: detail.dispute_outcome?.outcome_code ?? null,
    amount: detail.dispute_amount?.value ?? null,
    currency: detail.dispute_amount?.currency_code ?? null,
    raw: detail as unknown as Record<string, unknown>,
    lastSyncedAt: new Date(),
  };
  const [row] = await db()
    .insert(schema.disputes)
    .values(values)
    .onConflictDoUpdate({ target: schema.disputes.paypalDisputeId, set: values })
    .returning();

  // Log changes only, so polling every 10 seconds does not flood the activity log.
  const changed = !prev || prev.status !== values.status || prev.stage !== values.stage || prev.outcome !== values.outcome || prev.transactionId !== values.transactionId;
  if (changed) {
    await audit("system", prev ? "dispute.updated" : "dispute.synced", { type: "dispute", id: detail.dispute_id }, {
      status: values.status,
      stage: values.stage,
      outcome: values.outcome,
      linkedSale: sale ? sale.paypalCaptureId : null,
    });
  }
  return { detail, sale, row };
}
