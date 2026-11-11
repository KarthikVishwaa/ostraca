import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";
import { api, HttpError } from "@/lib/api";
import { describeAiFailure } from "@/lib/ai-errors";
import { env } from "@/lib/env";
import { extractEvidence, type Extraction } from "@/lib/ai/extract";
import { logError } from "@/lib/log";
import { aiGate } from "@/lib/rate-limit";
import { respond } from "@/lib/stream";
import { validateExtraction } from "@/lib/validation";
import { captureContext, recomputeReadiness } from "@/lib/proof";
import { proposeTracking } from "@/lib/tracking-proposal";
import { findEvidenceBySha, linkEvidence } from "@/lib/evidence-store";
import { checkUpload, MAX_UPLOAD_BYTES, safeFileName } from "@/lib/upload";

const KINDS = schema.evidenceKind.enumValues;
const fields = z.object({
  transactionId: z.string().uuid(),
  mode: z.enum(["manual", "ai", ""]).optional(),
  kind: z.string().max(40).optional(),
});

type UploadResult = {
  evidenceId: string;
  sha256: string;
  reused: boolean;
  alreadyLinked: boolean;
  manual: boolean;
  aiError: string | null;
  fieldCount: number;
};

/**
 * Flow A, step 1: upload → store original (sha256) → AI suggests → code validates. Nothing is sent to
 * PayPal here.
 */
export const POST = api({}, async ({ req, ip }) => {
  // Refuse a huge body before reading it all (Content-Length is a hint; the byte check below is the real limit).
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_UPLOAD_BYTES + 256 * 1024) throw new HttpError(413, "File too large (max 8 MB).");

  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "Invalid upload.");
  const file = form.get("file");
  const parsed = fields.safeParse({
    transactionId: String(form.get("transactionId") ?? ""),
    mode: String(form.get("mode") ?? ""),
    kind: String(form.get("kind") ?? "") || undefined,
  });
  if (!(file instanceof File) || !parsed.success) throw new HttpError(400, "A file and a sale are required.");
  const manual = parsed.data.mode === "manual";
  const chosenKind = KINDS.find((k) => k === parsed.data.kind);

  const bytes = Buffer.from(await file.arrayBuffer());
  const checked = checkUpload(bytes, file.type);
  if (!checked.ok) throw new HttpError(checked.status, checked.error);
  const mimeType = checked.mime; // the real type, never the declared one
  const fileName = safeFileName(file.name);

  const [tx] = await db().select().from(schema.transactions).where(eq(schema.transactions.id, parsed.data.transactionId));
  if (!tx) throw new HttpError(404, "transaction not found");

  return respond<UploadResult>(req, async (emit) => {
    emit("hashing", "Fingerprinting the file", 30);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    emit("hashing", "Fingerprinting the file", 36);

    // Same file already stored? Reuse it instead of storing (and paying to read) it twice.
    const dup = await findEvidenceBySha(sha256);
    if (dup) {
      emit("saving", "Linking it to this sale", 90);
      const isNewLink = await linkEvidence(tx.id, dup.id);
      await audit("seller", "evidence.reused", { type: "evidence", id: dup.id }, { sha256, fileName, newLinkToSale: isNewLink });
      await recomputeReadiness(tx.id);
      await proposeTracking(tx.id).catch((e) => logError("auto-queue failed", e)); // queues only; the seller still approves
      return { evidenceId: dup.id, sha256, reused: true, alreadyLinked: !isNewLink, manual, aiError: null, fieldCount: 0 };
    }

    // AI only suggests. Failure here is not fatal: the original is still kept.
    let extraction: Extraction | null = null;
    let aiError: string | null = null;
    if (!manual && env().ANTHROPIC_API_KEY) {
      const gate = await aiGate(ip);
      if (!gate.ok) throw new HttpError(gate.status, gate.error, gate.code, { retryAfter: gate.retryAfter }); // the page then offers manual entry
      emit("reading", "AI is reading the file", 38);
      try {
        extraction = await extractEvidence({ bytes, mimeType, fileName }, (f) => emit("reading", "AI is reading the file", 38 + f * 36));
      } catch (e) {
        logError("AI extraction failed", e);
        aiError = `AI could not read this file (${describeAiFailure(e)}). Your file is saved: type the details in instead.`;
      }
    } else if (!manual) {
      aiError = "AI is not set up (no API key). Your file is saved: type the details in instead.";
    }
    emit("checking", "Checking every value with code", 78);
    const checks = extraction ? validateExtraction(extraction, captureContext(tx)) : [];
    const model = env().CLAUDE_MODEL;

    emit("saving", "Saving the original and the checked fields", 90);
    const result = await db().transaction(async (t) => {
      const [ev] = await t
        .insert(schema.evidence)
        .values({ kind: chosenKind ?? extraction?.kind ?? "other", fileName, mimeType, sizeBytes: bytes.length, sha256, content: bytes })
        .returning({ id: schema.evidence.id });
      if (checks.length) {
        await t.insert(schema.evidenceExtractions).values(
          checks.map((c) => ({ evidenceId: ev.id, field: c.field, aiValue: c.aiValue, status: c.status, checkNote: c.note, model }))
        );
      }
      await t.insert(schema.transactionEvidence).values({ transactionId: tx.id, evidenceId: ev.id, linkedBy: "seller" });
      return ev;
    });

    await audit("seller", "evidence.uploaded", { type: "evidence", id: result.id }, { sha256, fileName, mode: manual ? "manual" : "ai" });
    if (extraction) await audit("ai", "evidence.extracted", { type: "evidence", id: result.id }, { confidence: extraction.confidence, fields: checks.length });
    if (aiError) await audit("system", "evidence.ai_unavailable", { type: "evidence", id: result.id }, { reason: aiError });

    await recomputeReadiness(tx.id);
    await proposeTracking(tx.id).catch((e) => logError("auto-queue failed", e)); // queues only; the seller still approves
    return { evidenceId: result.id, sha256, reused: false, alreadyLinked: false, manual, aiError, fieldCount: checks.length };
  });
});
