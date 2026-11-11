import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/db/audit";
import { api, HttpError, parseJson } from "@/lib/api";
import { describeAiFailure, templateNotice } from "@/lib/ai-errors";
import { env } from "@/lib/env";
import { logError } from "@/lib/log";
import { aiGate } from "@/lib/rate-limit";
import { respond } from "@/lib/stream";
import { getPack, packFacts } from "@/lib/limitation";
import { draftLimitationNote } from "@/lib/ai/limitation-note";
import { buildTemplate } from "@/lib/validation/draft";
import { checkNote } from "@/lib/validation/limitation";

const body = z.discriminatedUnion("action", [
  // `template: true` skips AI (used when AI is paused): free, not counted.
  z.object({ action: z.literal("generate"), template: z.boolean().optional() }),
  z.object({ action: z.literal("check"), note: z.string().max(4000) }),
]);

/** generate: Claude (or a plain template) writes a cover note from numbered facts; code checks it. */
export const POST = api({}, async ({ req, ip }) => {
  const input = await parseJson(req, body);

  if (input.action === "check") {
    const pack = await getPack(120_000);
    return NextResponse.json({ check: checkNote(input.note, packFacts(pack)) });
  }

  return respond(req, async (emit) => {
    emit("pack", "Reading your sales from PayPal and your records", 4);
    const pack = await getPack(0);
    emit("pack", "Reading your sales from PayPal and your records", 15);
    const facts = packFacts(pack);
    if (pack.summary.total === 0) {
      return { note: null, message: "There are no sales in the last 30 days, so there is nothing to describe." };
    }
    let note: string;
    let source: "ai" | "template" = "ai";
    let notice: string | null = null;
    if (input.template) {
      source = "template";
      notice = "Here is a plain template built from your numbers.";
      note = buildTemplate(facts);
    } else if (!env().ANTHROPIC_API_KEY) {
      source = "template";
      notice = templateNotice("AI is not set up (no API key)", "numbers");
      note = buildTemplate(facts);
    } else {
      const gate = await aiGate(ip);
      if (!gate.ok) throw new HttpError(gate.status, gate.error, gate.code, { retryAfter: gate.retryAfter });
      emit("writing", "Writing the cover note", 15);
      try {
        note = await draftLimitationNote(facts, (f) => emit("writing", "Writing the cover note", 15 + f * 64));
      } catch (e) {
        logError("limitation note failed", e);
        source = "template";
        notice = templateNotice(describeAiFailure(e), "numbers");
        note = buildTemplate(facts);
      }
    }
    emit("checking", "Checking every citation and number", 82);
    const check = checkNote(note, facts);
    emit("checking", "Checking every citation and number", 95);
    await audit(source === "ai" ? "ai" : "system", "limitation.note_generated", { type: "limitation", id: "pack" }, { source, ok: check.ok, problems: check.problems.length });
    return { note, source, notice, check, facts: facts.map((f) => ({ id: f.id, text: f.text })) };
  });
});
