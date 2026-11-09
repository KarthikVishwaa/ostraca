import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import type { Fact } from "@/lib/validation/draft";

/**
 * AI DRAFT. Claude only suggests wording. It sees numbered facts and nothing else (no buyer
 * messages, so a buyer cannot put instructions in front of it). src/lib/validation/draft.ts
 * then checks every citation and every number before the seller can approve anything.
 */
const SYSTEM = `You write a short evidence response for a small online seller who is answering a PayPal dispute.
Rules, all mandatory:
- Use ONLY the numbered facts you are given. Do not add, assume or round anything.
- Every sentence must end with the IDs of the facts it relies on, written like [F2] or [F2, F4], placed before the final period.
- Write dates exactly as YYYY-MM-DD. Copy tracking numbers, IDs and amounts exactly as in the facts.
- Say a parcel was delivered or received ONLY if a fact says so. Otherwise do not mention delivery.
- No promises, no opinions, no speculation, no greeting or signature. Plain, polite, at most 120 words.
- If a fact is only context, you may cite it but do not argue from it.`;

export async function draftDisputeResponse(input: { facts: Fact[]; reason: string }): Promise<string> {
  const { ANTHROPIC_API_KEY, CLAUDE_MODEL } = env();
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const list = input.facts.map((f) => `${f.id}: ${f.text}`).join("\n");
  const res = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 3000, // the model may spend part of this thinking before it writes
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Dispute reason: ${input.reason.replace(/_/g, " ").toLowerCase()}\n\nFacts:\n${list}\n\nWrite the response now. Output only the response text.`,
      },
    ],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("Claude returned an empty draft");
  return text;
}
