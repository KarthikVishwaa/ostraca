import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI, { toFile } from "openai";
import { z } from "zod";
import { env } from "@/lib/env";

/**
 * AI EXTRACTION — the AI only *suggests*. Nothing here is trusted until
 * src/lib/validation checks it and the seller confirms it.
 *
 *  - Images & PDFs (receipts, invoices, screenshots) → Claude reads them directly.
 *  - Voice notes (Tamil / Hindi / English)          → OpenAI transcribes, then Claude extracts.
 */

export const extractionSchema = z.object({
  kind: z.enum(["courier_receipt", "invoice", "chat_screenshot", "delivery_photo", "voice_note", "other"]),
  language: z.string().nullable(),
  transcript_original: z.string().nullable(),
  transcript_english: z.string().nullable(),
  tracking_number: z.string().nullable(),
  carrier: z.string().nullable(),
  amount: z.string().nullable(),
  currency: z.string().nullable(),
  date: z.string().nullable(), // ISO yyyy-mm-dd if present
  buyer_name: z.string().nullable(),
  destination_city: z.string().nullable(),
  items: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export type Extraction = z.infer<typeof extractionSchema>;

const nullableString = { type: ["string", "null"] } as const;

/** Claude is forced to "call" this tool, which gives us schema-shaped JSON back. */
const recordTool: Anthropic.Tool = {
  name: "record_evidence",
  description: "Record the facts found in the seller's evidence.",
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["courier_receipt", "invoice", "chat_screenshot", "delivery_photo", "voice_note", "other"] },
      language: nullableString,
      transcript_original: nullableString,
      transcript_english: nullableString,
      tracking_number: nullableString,
      carrier: nullableString,
      amount: nullableString,
      currency: { type: ["string", "null"], description: "ISO 4217 code, e.g. USD, INR" },
      date: { type: ["string", "null"], description: "ISO date yyyy-mm-dd" },
      buyer_name: nullableString,
      destination_city: nullableString,
      items: nullableString,
      confidence: { type: "number", description: "Overall certainty from 0 to 1" },
    },
    required: [
      "kind", "language", "transcript_original", "transcript_english", "tracking_number", "carrier",
      "amount", "currency", "date", "buyer_name", "destination_city", "items", "confidence",
    ],
  },
};

const SYSTEM = `You extract shipping and sales evidence for a small online seller.
Report ONLY facts that are clearly present in the evidence. Never guess: if a field is not
clearly present, use null. Copy tracking numbers character by character exactly as shown.
If you are given a voice-note transcript, translate it to English in transcript_english
and keep the original wording in transcript_original.`;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

export async function extractEvidence(file: { bytes: Buffer; mimeType: string; fileName?: string }): Promise<Extraction> {
  const { ANTHROPIC_API_KEY, CLAUDE_MODEL } = env();
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const content: Anthropic.ContentBlockParam[] = [];
  let transcript: { text: string; language: string | null } | null = null;

  if (file.mimeType.startsWith("audio/")) {
    transcript = await transcribe(file);
    content.push({
      type: "text",
      text: `Voice note from the seller (detected language: ${transcript.language ?? "unknown"}). Transcript:\n"""${transcript.text}"""`,
    });
  } else if ((IMAGE_TYPES as readonly string[]).includes(file.mimeType)) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: file.mimeType as ImageType, data: file.bytes.toString("base64") },
    });
  } else if (file.mimeType === "application/pdf") {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: file.bytes.toString("base64") },
    });
  } else {
    throw new Error(`Unsupported evidence type: ${file.mimeType}`);
  }
  content.push({ type: "text", text: "Extract the evidence. You MUST answer by calling the record_evidence tool exactly once, even if every field is null." });

  const res = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    tools: [recordTool],
    // Forced tool_choice ("tool"/"any") is rejected by this model, so ask for the tool in the
    // prompt and fail clearly below if it is not called. zod still checks the shape.
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content }],
  });

  const call = res.content.find((b) => b.type === "tool_use");
  if (!call || call.type !== "tool_use") throw new Error("Claude did not return structured evidence");

  const parsed = extractionSchema.safeParse(call.input);
  if (!parsed.success) throw new Error("AI returned an unexpected shape: " + parsed.error.message);

  // The raw transcript comes from the speech model, not from Claude's re-telling of it.
  if (transcript) {
    parsed.data.kind = "voice_note";
    parsed.data.transcript_original = transcript.text;
    parsed.data.language = transcript.language ?? parsed.data.language;
  }
  return parsed.data;
}

/** Speech → text with OpenAI. Works for Tamil, Hindi and English. */
async function transcribe(file: { bytes: Buffer; mimeType: string; fileName?: string }) {
  const { OPENAI_API_KEY, OPENAI_TRANSCRIBE_MODEL } = env();
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set (needed for voice notes)");
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const ext = file.mimeType.split("/")[1]?.replace("x-", "").replace("mpeg", "mp3") ?? "webm";
  const result = await openai.audio.transcriptions.create({
    file: await toFile(file.bytes, file.fileName ?? `voice-note.${ext}`, { type: file.mimeType }),
    model: OPENAI_TRANSCRIBE_MODEL,
  });
  return { text: result.text, language: null as string | null };
}
