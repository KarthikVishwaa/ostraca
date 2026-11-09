import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";
import { approveAction, markExecuted, markFailed } from "@/lib/approvals";
import { executeAction } from "@/lib/paypal/execute";
import { recomputeReadiness } from "@/lib/proof";
import { paypalErrorResponse } from "@/lib/http";
import { PayPalError } from "@/lib/paypal/client";

/** Seller approves → we execute against PayPal with the stored idempotency key → record the outcome. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
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
    return NextResponse.json({ status: "executed" });
  } catch (e) {
    const debugId = e instanceof PayPalError ? e.debugId : undefined;
    await markFailed(id, `${(e as Error).message}${debugId ? ` (PayPal debug_id: ${debugId})` : ""}`);
    return paypalErrorResponse(e);
  }
}
