import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";
import { proposeAction } from "@/lib/approvals";
import { confirmedTracking } from "@/lib/proof";
import { checkTracking } from "@/lib/validation/tracking";
import { toPayPalCarrier } from "@/lib/paypal/carriers";

export type Proposal = { ok: true; action: typeof schema.agentActions.$inferSelect } | { ok: false; reason: string };

/**
 * Queue "file tracking with PayPal" as a PENDING action, built from seller-confirmed values only. It never
 * calls PayPal. `revive` re-queues one the seller rejected earlier (only when they ask again).
 */
export async function proposeTracking(transactionId: string, opts: { revive?: boolean } = {}): Promise<Proposal> {
  const [tx] = await db().select().from(schema.transactions).where(eq(schema.transactions.id, transactionId));
  if (!tx) return { ok: false, reason: "transaction not found" };
  if (tx.trackingFiled) return { ok: false, reason: "Tracking is already filed for this sale" };

  const { trackingNumber, carrier } = await confirmedTracking(transactionId);
  if (!trackingNumber) return { ok: false, reason: "No verified tracking number yet. Confirm or enter one first." };
  const carrierName = carrier ?? checkTracking(trackingNumber).carrierGuess;
  if (!carrierName) return { ok: false, reason: "Add the carrier (for example DHL or India Post) first." };

  // Same sale + same tracking number = same key, so a double click can never file twice.
  const idempotencyKey = `track-${tx.paypalCaptureId}-${trackingNumber}`;

  // A pending request for an older tracking number is stale now.
  const stale = await db()
    .update(schema.agentActions)
    .set({ status: "rejected", error: "Superseded by a newer tracking number" })
    .where(
      and(
        eq(schema.agentActions.transactionId, transactionId),
        eq(schema.agentActions.type, "add_tracking"),
        eq(schema.agentActions.status, "pending"),
        ne(schema.agentActions.idempotencyKey, idempotencyKey)
      )
    )
    .returning({ id: schema.agentActions.id });
  for (const s of stale) await audit("system", "action.superseded", { type: "agent_action", id: s.id });

  const action = await proposeAction(
    {
      type: "add_tracking",
      transactionId,
      payload: { orderId: tx.paypalOrderId, captureId: tx.paypalCaptureId, trackingNumber, ...toPayPalCarrier(carrierName) },
      idempotencyKey,
    },
    opts
  );
  return { ok: true, action };
}
