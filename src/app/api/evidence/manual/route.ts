import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";
import { validateField, type FieldResult, type ManualField } from "@/lib/validation";
import { captureContext, recomputeReadiness } from "@/lib/proof";
import { findEvidenceBySha, linkEvidence } from "@/lib/evidence-store";
import { proposeTracking } from "@/lib/tracking-proposal";

const body = z.object({
  transactionId: z.string().uuid(),
  trackingNumber: z.string().trim().min(1).max(60),
  carrier: z.string().trim().min(1).max(60),
  shipDate: z.string().trim().max(10).optional().or(z.literal("")),
  destinationCity: z.string().trim().max(80).optional().or(z.literal("")),
});

/**
 * Manual entry, no AI. The typed values are saved as a tiny JSON record (so there is still an
 * original with a SHA-256), then every field goes through the same validation code as AI suggestions.
 * Values the seller typed count as confirmed, unless code rejects them (they stay visible, flagged).
 */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Tracking number and carrier are required." }, { status: 400 });
  const input = parsed.data;

  const [tx] = await db().select().from(schema.transactions).where(eq(schema.transactions.id, input.transactionId));
  if (!tx) return NextResponse.json({ error: "transaction not found" }, { status: 404 });

  const entries: Array<[ManualField, string]> = [
    ["tracking_number", input.trackingNumber],
    ["carrier", input.carrier],
    ...(input.shipDate ? ([["date", input.shipDate]] as Array<[ManualField, string]>) : []),
    ...(input.destinationCity ? ([["destination_city", input.destinationCity]] as Array<[ManualField, string]>) : []),
  ];
  const ctx = captureContext(tx);
  const checks: FieldResult[] = entries.map(([field, value]) => validateField(field, value, ctx));

  const bytes = Buffer.from(JSON.stringify({ type: "manual_entry", ...Object.fromEntries(entries) }, null, 2));
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const dup = await findEvidenceBySha(sha256);
  if (dup) {
    const isNewLink = await linkEvidence(tx.id, dup.id);
    await audit("seller", "evidence.reused", { type: "evidence", id: dup.id }, { sha256, fileName: "manual-entry.json", newLinkToSale: isNewLink });
    await recomputeReadiness(tx.id);
    await proposeTracking(tx.id).catch((e) => console.error("auto-queue failed", e)); // queues only; the seller still approves
    return NextResponse.json({ evidenceId: dup.id, reused: true, alreadyLinked: !isNewLink, checks });
  }

  const ev = await db().transaction(async (t) => {
    const [row] = await t
      .insert(schema.evidence)
      .values({ kind: "courier_receipt", fileName: "manual-entry.json", mimeType: "application/json", sizeBytes: bytes.length, sha256, content: bytes })
      .returning({ id: schema.evidence.id });
    await t.insert(schema.evidenceExtractions).values(
      checks.map((c, i) => ({
        evidenceId: row.id,
        field: c.field,
        aiValue: entries[i][1], // what was typed
        confirmedValue: c.status === "rejected" ? null : (c.aiValue ?? entries[i][1]),
        status: c.status,
        checkNote: c.note,
        model: "manual",
      }))
    );
    await t.insert(schema.transactionEvidence).values({ transactionId: tx.id, evidenceId: row.id, linkedBy: "seller" });
    return row;
  });

  await audit("seller", "evidence.uploaded", { type: "evidence", id: ev.id }, { sha256, fileName: "manual-entry.json", mode: "manual" });
  for (const c of checks) {
    await audit("seller", c.status === "rejected" ? "field.rejected_by_check" : "field.entered", { type: "evidence", id: ev.id }, { field: c.field, to: c.aiValue, check: c.status });
  }
  const result = await recomputeReadiness(tx.id);
  await proposeTracking(tx.id).catch((e) => console.error("auto-queue failed", e)); // queues only; the seller still approves
  return NextResponse.json({ evidenceId: ev.id, reused: false, checks, score: result.score });
}
