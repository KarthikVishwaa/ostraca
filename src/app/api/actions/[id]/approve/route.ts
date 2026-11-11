import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";
import { api, HttpError, notFound, parseParam } from "@/lib/api";
import { approveAction, getAction, markExecuted, markFailed } from "@/lib/approvals";
import { executeAction } from "@/lib/paypal/execute";
import { recomputeReadiness } from "@/lib/proof";
import { PayPalError } from "@/lib/paypal/client";
import { precheckEvidence } from "@/lib/dispute-proposal";
import { syncDispute } from "@/lib/disputes-sync";
import { redact, logError } from "@/lib/log";
import { respond } from "@/lib/stream";

/** Seller approves → (checks) → we execute against PayPal with the stored idempotency key → record the outcome. */
export const POST = api<{ id: string }>({ limit: "paypal-write" }, async ({ req, params }) => {
  const id = parseParam(params.id, z.string().uuid(), "action not found");
  const pending = await getAction(id);
  if (!pending) throw notFound("action not found");
  if (!["pending", "failed"].includes(pending.status)) throw new HttpError(409, "This action is not waiting for approval");

  return respond(req, async (emit) => {
    // Dispute evidence is only ever sent if PayPal says so right now. If not, nothing is approved or sent.
    if (pending.type === "provide_evidence") {
      emit("recheck", "Re-reading the dispute from PayPal", 8);
      const pre = await precheckEvidence(pending.payload as { paypalDisputeId: string; draft: string });
      if (!pre.ok) throw new HttpError(pre.status, pre.reason, undefined, { problems: pre.problems });
      emit("recheck", "Re-reading the dispute from PayPal", 35);
    } else {
      emit("recheck", "Checking the request", 30);
    }

    const action = await approveAction(id);
    if (!action) throw new HttpError(409, "This action is not waiting for approval");

    emit("send", "Sending to PayPal", 45);
    try {
      const response = await executeAction(action);
      await markExecuted(id, response);
      emit("status", "Reading the new status from PayPal", 75);
      if (action.type === "add_tracking" && action.transactionId) {
        await db().update(schema.transactions).set({ trackingFiled: new Date() }).where(eq(schema.transactions.id, action.transactionId));
        await audit("system", "tracking.filed", { type: "transaction", id: action.transactionId }, { actionId: id });
        await recomputeReadiness(action.transactionId);
      }
      if (action.type === "provide_evidence") {
        const disputeId = (action.payload as { paypalDisputeId: string }).paypalDisputeId;
        await audit("system", "dispute.evidence_submitted", { type: "dispute", id: disputeId }, { actionId: id });
        await syncDispute(disputeId).catch((e) => logError("re-read after evidence failed", e)); // real status comes from PayPal
      }
      emit("status", "Reading the new status from PayPal", 95);
      return { status: "executed" };
    } catch (e) {
      const debugId = e instanceof PayPalError ? e.debugId : undefined;
      // Stored in the audit trail the seller sees: redacted, and PayPal's own message only.
      const why = e instanceof PayPalError ? e.message : "The request could not be completed.";
      await markFailed(id, `${redact(why)}${debugId ? ` (PayPal debug_id: ${debugId})` : ""}`);
      throw e; // mapped to PayPal's real message + debug_id by the shared error layer
    }
  });
});
