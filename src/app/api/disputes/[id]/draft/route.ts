import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/db/audit";
import { api, HttpError, parseJson, parseParam } from "@/lib/api";
import { describeAiFailure, templateNotice } from "@/lib/ai-errors";
import { env } from "@/lib/env";
import { logError } from "@/lib/log";
import { aiGate } from "@/lib/rate-limit";
import { respond } from "@/lib/stream";
import { disputeIdSchema, loadDispute } from "@/lib/dispute-proposal";
import { draftDisputeResponse } from "@/lib/ai/dispute-draft";
import { buildTemplate, checkDraft } from "@/lib/validation/draft";

const body = z.discriminatedUnion("action", [
  // `template: true` skips AI entirely (used when AI is paused); it costs nothing and is not counted.
  z.object({ action: z.literal("generate"), template: z.boolean().optional() }),
  z.object({ action: z.literal("check"), draft: z.string().max(6000) }),
]);

/** generate: AI (or a plain template) writes a draft from the numbered facts; code then checks it. */
export const POST = api<{ id: string }>({}, async ({ req, params, ip }) => {
  const id = parseParam(params.id, disputeIdSchema, "dispute not found");
  const input = await parseJson(req, body);

  if (input.action === "check") {
    const d = await loadDispute(id);
    if (!d.built) return NextResponse.json({ check: { ok: false, problems: ["No matching sale for this dispute."], cited: [] } });
    return NextResponse.json({ check: checkDraft(input.draft, d.built.facts) });
  }

  return respond(req, async (emit) => {
    emit("facts", "Collecting verified facts", 4);
    const d = await loadDispute(id); // re-reads the dispute from PayPal and builds the numbered facts
    emit("facts", "Collecting verified facts", 15);
    if (!d.sale || !d.built) {
      return { draft: null, reason: "no_sale", message: "No matching sale for this dispute, so there is nothing to cite.", missing: [] as string[] };
    }
    const { facts, missing, hasProof } = d.built;
    if (!hasProof) {
      return {
        draft: null,
        reason: "no_proof",
        message: "There is no verified proof on file for this sale yet, so there is nothing honest to say. Nothing was invented.",
        missing,
      };
    }

    let draft: string;
    let source: "ai" | "template" = "ai";
    let notice: string | null = null;
    if (input.template) {
      source = "template";
      notice = "Here is a plain template built from your facts.";
      draft = buildTemplate(facts);
    } else if (!env().ANTHROPIC_API_KEY) {
      source = "template";
      notice = templateNotice("AI is not set up (no API key)", "facts");
      draft = buildTemplate(facts);
    } else {
      const gate = await aiGate(ip);
      if (!gate.ok) throw new HttpError(gate.status, gate.error, gate.code, { retryAfter: gate.retryAfter });
      emit("writing", "Writing the draft", 15);
      try {
        draft = await draftDisputeResponse({ facts, reason: d.detail.reason ?? "unspecified" }, (f) => emit("writing", "Writing the draft", 15 + f * 64)); // never reaches 80 before the model is done
      } catch (e) {
        logError("dispute draft failed", e);
        source = "template";
        notice = templateNotice(describeAiFailure(e), "facts");
        draft = buildTemplate(facts);
      }
    }
    emit("checking", "Checking every citation and number", 82);
    const check = checkDraft(draft, facts);
    emit("checking", "Checking every citation and number", 95);
    await audit(source === "ai" ? "ai" : "system", "dispute.draft_generated", { type: "dispute", id: d.detail.dispute_id }, { source, ok: check.ok, problems: check.problems.length });
    return { draft, source, notice, check, missing };
  });
});
