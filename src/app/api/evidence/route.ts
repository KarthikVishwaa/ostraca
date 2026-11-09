import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";
import { extractEvidence } from "@/lib/ai/extract";
import { validateExtraction } from "@/lib/validation";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = /^(image\/(png|jpeg|webp|gif)|application\/pdf|audio\/(mpeg|mp4|ogg|wav|webm|x-m4a|aac))$/;

/**
 * Flow A, step 1: upload → store original (sha256) → AI suggests → code validates.
 * Returns fields for the seller to confirm. Nothing is sent to PayPal here.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const transactionId = String(form.get("transactionId") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "file too large (max 8 MB)" }, { status: 413 });
  if (!ALLOWED.test(file.type)) return NextResponse.json({ error: `unsupported type ${file.type}` }, { status: 415 });

  const [tx] = await db().select().from(schema.transactions).where(eq(schema.transactions.id, transactionId));
  if (!tx) return NextResponse.json({ error: "transaction not found" }, { status: 404 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const extraction = await extractEvidence({ bytes, mimeType: file.type, fileName: file.name });
  const checks = validateExtraction(extraction, {
    amount: tx.amount,
    currency: tx.currency,
    capturedAt: tx.capturedAt,
    buyerName: tx.buyerName,
    shipToCity: tx.shipToCity,
  });

  const result = await db().transaction(async (t) => {
    const [ev] = await t
      .insert(schema.evidence)
      .values({ kind: extraction.kind, fileName: file.name, mimeType: file.type, sizeBytes: file.size, sha256, content: bytes })
      .returning({ id: schema.evidence.id });
    if (checks.length) {
      await t.insert(schema.evidenceExtractions).values(
        checks.map((c) => ({ evidenceId: ev.id, field: c.field, aiValue: c.aiValue, status: c.status, checkNote: c.note }))
      );
    }
    await t.insert(schema.transactionEvidence).values({ transactionId: tx.id, evidenceId: ev.id, linkedBy: "seller" });
    return ev;
  });

  await audit("ai", "evidence.extracted", { type: "evidence", id: result.id }, { sha256, confidence: extraction.confidence });
  return NextResponse.json({ evidenceId: result.id, sha256, extraction, checks });
}
