import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";
import { env } from "@/lib/env";
import { extractEvidence, type Extraction } from "@/lib/ai/extract";
import { validateExtraction } from "@/lib/validation";
import { captureContext, recomputeReadiness } from "@/lib/proof";
import { proposeTracking } from "@/lib/tracking-proposal";
import { findEvidenceBySha, linkEvidence } from "@/lib/evidence-store";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = /^(image\/(png|jpeg|webp|gif)|application\/pdf|audio\/(mpeg|mp4|ogg|wav|webm|x-m4a|aac))$/;
const KINDS = schema.evidenceKind.enumValues;

/**
 * Flow A, step 1: upload → store original (sha256) → AI suggests → code validates.
 * Nothing is sent to PayPal here. If AI is off or fails (or the seller chose Manual entry),
 * the file is still stored and the seller types the fields in.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const transactionId = String(form.get("transactionId") ?? "");
  const manual = form.get("mode") === "manual";
  const chosenKind = KINDS.find((k) => k === form.get("kind"));
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "file too large (max 8 MB)" }, { status: 413 });
  if (!ALLOWED.test(file.type)) return NextResponse.json({ error: `unsupported type ${file.type}` }, { status: 415 });

  const [tx] = await db().select().from(schema.transactions).where(eq(schema.transactions.id, transactionId));
  if (!tx) return NextResponse.json({ error: "transaction not found" }, { status: 404 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // Same file already stored? Reuse it instead of storing (and paying to read) it twice.
  const dup = await findEvidenceBySha(sha256);
  if (dup) {
    const isNewLink = await linkEvidence(tx.id, dup.id);
    await audit("seller", "evidence.reused", { type: "evidence", id: dup.id }, { sha256, fileName: file.name, newLinkToSale: isNewLink });
    await recomputeReadiness(tx.id);
    await proposeTracking(tx.id).catch((e) => console.error("auto-queue failed", e)); // queues only; the seller still approves
    return NextResponse.json({ evidenceId: dup.id, sha256, reused: true, alreadyLinked: !isNewLink, manual, aiError: null, fieldCount: 0 });
  }

  // AI only suggests. Failure here is not fatal: the original is still kept.
  let extraction: Extraction | null = null;
  let aiError: string | null = null;
  if (!manual) {
    try {
      extraction = await extractEvidence({ bytes, mimeType: file.type, fileName: file.name });
    } catch (e) {
      aiError = (e as Error).message;
      console.error("AI extraction failed", e);
    }
  }
  const checks = extraction ? validateExtraction(extraction, captureContext(tx)) : [];
  const model = env().CLAUDE_MODEL;

  const result = await db().transaction(async (t) => {
    const [ev] = await t
      .insert(schema.evidence)
      .values({
        kind: chosenKind ?? extraction?.kind ?? "other",
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        sha256,
        content: bytes,
      })
      .returning({ id: schema.evidence.id });
    if (checks.length) {
      await t.insert(schema.evidenceExtractions).values(
        checks.map((c) => ({ evidenceId: ev.id, field: c.field, aiValue: c.aiValue, status: c.status, checkNote: c.note, model }))
      );
    }
    await t.insert(schema.transactionEvidence).values({ transactionId: tx.id, evidenceId: ev.id, linkedBy: "seller" });
    return ev;
  });

  await audit("seller", "evidence.uploaded", { type: "evidence", id: result.id }, { sha256, fileName: file.name, mode: manual ? "manual" : "ai" });
  if (extraction) await audit("ai", "evidence.extracted", { type: "evidence", id: result.id }, { confidence: extraction.confidence, fields: checks.length });
  if (aiError) await audit("system", "evidence.ai_unavailable", { type: "evidence", id: result.id }, { reason: aiError });

  await recomputeReadiness(tx.id);
  await proposeTracking(tx.id).catch((e) => console.error("auto-queue failed", e)); // queues only; the seller still approves
  return NextResponse.json({ evidenceId: result.id, sha256, manual, aiError, fieldCount: checks.length });
}
