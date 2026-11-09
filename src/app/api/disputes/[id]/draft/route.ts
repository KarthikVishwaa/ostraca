import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/db/audit";
import { env } from "@/lib/env";
import { paypalErrorResponse } from "@/lib/http";
import { disputeIdSchema, loadDispute } from "@/lib/dispute-proposal";
import { draftDisputeResponse } from "@/lib/ai/dispute-draft";
import { buildTemplate, checkDraft } from "@/lib/validation/draft";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate") }),
  z.object({ action: z.literal("check"), draft: z.string().max(6000) }),
]);

/**
 * generate: AI (or a plain template) writes a draft from the numbered facts; code then checks it.
 * check:    re-checks text the seller edited. Nothing here is saved or sent to PayPal.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = disputeIdSchema.safeParse((await ctx.params).id);
  const input = body.safeParse(await req.json().catch(() => null));
  if (!id.success || !input.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  try {
    const d = await loadDispute(id.data);
    if (!d.sale || !d.built) {
      return NextResponse.json({ draft: null, reason: "no_sale", message: "No matching sale for this dispute, so there is nothing to cite.", missing: [] });
    }
    const { facts, missing, hasProof } = d.built;

    if (input.data.action === "check") {
      return NextResponse.json({ check: checkDraft(input.data.draft, facts) });
    }

    if (!hasProof) {
      return NextResponse.json({
        draft: null,
        reason: "no_proof",
        message: "There is no verified proof on file for this sale yet, so there is nothing honest to say. Nothing was invented.",
        missing,
      });
    }

    let draft: string;
    let source: "ai" | "template" = "ai";
    let notice: string | null = null;
    if (!env().ANTHROPIC_API_KEY) {
      source = "template";
      notice = "AI drafting is off (ANTHROPIC_API_KEY is not set). Here is a plain template built from your facts.";
      draft = buildTemplate(facts);
    } else {
      try {
        draft = await draftDisputeResponse({ facts, reason: d.detail.reason });
      } catch (e) {
        console.error("dispute draft failed", e);
        source = "template";
        notice = `AI drafting failed (${(e as Error).message}). Here is a plain template built from your facts.`;
        draft = buildTemplate(facts);
      }
    }
    const check = checkDraft(draft, facts);
    await audit(source === "ai" ? "ai" : "system", "dispute.draft_generated", { type: "dispute", id: d.detail.dispute_id }, { source, ok: check.ok, problems: check.problems.length });
    return NextResponse.json({ draft, source, notice, check, missing });
  } catch (e) {
    return paypalErrorResponse(e);
  }
}
