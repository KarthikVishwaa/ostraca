import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/db/audit";
import { env } from "@/lib/env";
import { PayPalError } from "@/lib/paypal/client";
import { sandboxAdjudicate, sandboxRequireEvidence } from "@/lib/paypal/disputes";
import { syncDispute } from "@/lib/disputes-sync";
import { paypalErrorResponse } from "@/lib/http";
import { disputeIdSchema } from "@/lib/dispute-proposal";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("require_evidence") }),
  z.object({ action: z.literal("adjudicate"), outcome: z.enum(["SELLER_FAVOR", "BUYER_FAVOR"]) }),
]);

/**
 * SANDBOX ONLY. Simulates buyer / PayPal steps so a demo can move forward. Refuses outside the sandbox.
 * These are staging tools, not seller actions, so they are not sent through the evidence approval queue;
 * each click is an explicit choice and every call is written to the audit log. The result is whatever PayPal says.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!env().PAYPAL_API_BASE.includes("sandbox")) {
    return NextResponse.json({ error: "Sandbox helpers are disabled outside the PayPal sandbox." }, { status: 403 });
  }
  const id = disputeIdSchema.safeParse((await ctx.params).id);
  const input = body.safeParse(await req.json().catch(() => null));
  if (!id.success || !input.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  try {
    await syncDispute(id.data); // throws for a dispute created before the last data reset
  } catch (e) {
    return paypalErrorResponse(e);
  }

  const what = input.data.action === "adjudicate" ? `adjudicate:${input.data.outcome}` : "require_evidence";
  try {
    if (input.data.action === "require_evidence") await sandboxRequireEvidence(id.data);
    else await sandboxAdjudicate(id.data, input.data.outcome);
    await audit("seller", "dispute.sandbox_step", { type: "dispute", id: id.data }, { step: what, result: "accepted by PayPal" });
  } catch (e) {
    await audit("seller", "dispute.sandbox_step", { type: "dispute", id: id.data }, {
      step: what,
      result: "refused by PayPal",
      error: (e as Error).message,
      debug_id: e instanceof PayPalError ? e.debugId : undefined,
    });
    await syncDispute(id.data).catch(() => null);
    return paypalErrorResponse(e);
  }
  const { detail } = await syncDispute(id.data); // the real status, as PayPal reports it now
  return NextResponse.json({ status: detail.status, stage: detail.dispute_life_cycle_stage ?? null });
}
