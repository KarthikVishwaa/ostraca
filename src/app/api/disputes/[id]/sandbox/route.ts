import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/db/audit";
import { api, errorResponse, HttpError, parseJson, parseParam } from "@/lib/api";
import { env } from "@/lib/env";
import { PayPalError } from "@/lib/paypal/client";
import { sandboxAdjudicate, sandboxRequireEvidence } from "@/lib/paypal/disputes";
import { syncDispute } from "@/lib/disputes-sync";
import { disputeIdSchema } from "@/lib/dispute-proposal";
import { redact } from "@/lib/log";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("require_evidence") }),
  z.object({ action: z.literal("adjudicate"), outcome: z.enum(["SELLER_FAVOR", "BUYER_FAVOR"]) }),
]);

/** SANDBOX ONLY. Simulates buyer / PayPal steps so a demo can move forward. Refuses outside the sandbox. */
export const POST = api<{ id: string }>({ limit: "paypal-write" }, async ({ req, params }) => {
  if (!env().PAYPAL_API_BASE.includes("sandbox")) {
    throw new HttpError(403, "Sandbox helpers are disabled outside the PayPal sandbox.");
  }
  const id = parseParam(params.id, disputeIdSchema, "dispute not found");
  const input = await parseJson(req, body);

  await syncDispute(id); // 404 unless it is this user's dispute

  const what = input.action === "adjudicate" ? `adjudicate:${input.outcome}` : "require_evidence";
  try {
    if (input.action === "require_evidence") await sandboxRequireEvidence(id);
    else await sandboxAdjudicate(id, input.outcome);
    await audit("seller", "dispute.sandbox_step", { type: "dispute", id }, { step: what, result: "accepted by PayPal" });
  } catch (e) {
    await audit("seller", "dispute.sandbox_step", { type: "dispute", id }, {
      step: what,
      result: "refused by PayPal",
      error: e instanceof PayPalError ? redact(e.message) : "failed",
      debug_id: e instanceof PayPalError ? e.debugId : undefined,
    });
    await syncDispute(id).catch(() => null);
    return errorResponse(e);
  }
  const { detail } = await syncDispute(id); // the real status, as PayPal reports it now
  return NextResponse.json({ status: detail.status, stage: detail.dispute_life_cycle_stage ?? null });
});
