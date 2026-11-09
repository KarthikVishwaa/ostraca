import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";
import { approveAction, getAction, markExecuted, markFailed } from "@/lib/approvals";
import { executeAction } from "@/lib/paypal/execute";
import { recomputeReadiness } from "@/lib/proof";
import { paypalErrorResponse } from "@/lib/http";
import { PayPalError } from "@/lib/paypal/client";
import { precheckEvidence } from "@/lib/dispute-proposal";
import { syncDispute } from "@/lib/disputes-sync";

/** Seller approves → (checks) → we execute against PayPal with the stored idempotency key → record the outcome. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pending = await getAction(id);
  if (!pending || !["pending", "failed"].includes(pending.status)) {
    return NextResponse.json({ error: "This action is not waiting for approval" }, { status: 409 });
  }

  // Dispute evidence is only ever sent if PayPal says so right now. If not, nothing is approved or sent.
  if (pending.type === "provide_evidence") {
    try {
      const pre = await precheckEvidence(pending.payload as { paypalDisputeId: string; draft: string });
      if (!pre.ok) return NextResponse.json({ error: pre.reason, problems: pre.problems }, { status: pre.status });
    } catch (e) {
      return paypalErrorResponse(e);
    }
  }

  const action = await approveAction(id);
  if (!action) return NextResponse.json({ error: "This action is not waiting for approval" }, { status: 409 });

  try {
    const response = await executeAction(action);
    await markExecuted(id, response);
    if (action.type === "add_tracking" && action.transactionId) {
      await db().update(schema.transactions).set({ trackingFiled: new Date() }).where(eq(schema.transactions.id, action.transactionId));
      await audit("system", "tracking.filed", { type: "transaction", id: action.transactionId }, { actionId: id });
      await recomputeReadiness(action.transactionId);
    }
    if (action.type === "provide_evidence") {
      const disputeId = (action.payload as { paypalDisputeId: string }).paypalDisputeId;
      await audit("system", "dispute.evidence_submitted", { type: "dispute", id: disputeId }, { actionId: id });
      await syncDispute(disputeId).catch((e) => console.error("re-read after evidence failed", e)); // real status comes from PayPal
    }
    return NextResponse.json({ status: "executed" });
  } catch (e) {
    const debugId = e instanceof PayPalError ? e.debugId : undefined;
    await markFailed(id, `${(e as Error).message}${debugId ? ` (PayPal debug_id: ${debugId})` : ""}`);
    return paypalErrorResponse(e);
  }
}
