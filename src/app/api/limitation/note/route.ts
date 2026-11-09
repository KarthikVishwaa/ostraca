import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/db/audit";
import { env } from "@/lib/env";
import { getPack, packFacts } from "@/lib/limitation";
import { draftLimitationNote } from "@/lib/ai/limitation-note";
import { buildTemplate } from "@/lib/validation/draft";
import { checkNote } from "@/lib/validation/limitation";
import { paypalErrorResponse } from "@/lib/http";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate") }),
  z.object({ action: z.literal("check"), note: z.string().max(4000) }),
]);

/**
 * generate: Claude (or a plain template) writes a cover note from numbered facts; code checks it.
 * check:    re-checks what the seller edited. Nothing is saved or sent to PayPal.
 */
export async function POST(req: Request) {
  const input = body.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    const pack = await getPack(input.data.action === "check" ? 120_000 : 0);
    const facts = packFacts(pack);
    if (input.data.action === "check") return NextResponse.json({ check: checkNote(input.data.note, facts) });

    if (pack.summary.total === 0) {
      return NextResponse.json({ note: null, message: "There are no sales in the last 30 days, so there is nothing to describe." });
    }
    let note: string;
    let source: "ai" | "template" = "ai";
    let notice: string | null = null;
    if (!env().ANTHROPIC_API_KEY) {
      source = "template";
      notice = "AI drafting is off (ANTHROPIC_API_KEY is not set). Here is a plain template built from your numbers.";
      note = buildTemplate(facts);
    } else {
      try {
        note = await draftLimitationNote(facts);
      } catch (e) {
        console.error("limitation note failed", e);
        source = "template";
        notice = `AI drafting failed (${(e as Error).message}). Here is a plain template built from your numbers.`;
        note = buildTemplate(facts);
      }
    }
    const check = checkNote(note, facts);
    await audit(source === "ai" ? "ai" : "system", "limitation.note_generated", { type: "limitation", id: "pack" }, { source, ok: check.ok, problems: check.problems.length });
    return NextResponse.json({ note, source, notice, check, facts: facts.map((f) => ({ id: f.id, text: f.text })) });
  } catch (e) {
    return paypalErrorResponse(e);
  }
}
