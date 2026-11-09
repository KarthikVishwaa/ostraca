import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";
import { MANUAL_FIELDS, validateField } from "@/lib/validation";
import { proposeTracking } from "@/lib/tracking-proposal";
import { captureContext, effectiveValue, recomputeReadiness } from "@/lib/proof";

const body = z.object({
  field: z.enum(MANUAL_FIELDS),
  /** Omit to confirm the suggested value as-is; send a value to edit it (or to enter one manually). */
  value: z.string().trim().min(1).max(200).optional(),
});

/**
 * Seller confirms, edits, or manually enters one field. Edits are re-checked by the same
 * deterministic rules as AI suggestions; a rejected value can never be confirmed.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: evidenceId } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "field and a non-empty value are required" }, { status: 400 });
  const { field, value } = parsed.data;

  const [link] = await db()
    .select({ tx: schema.transactions })
    .from(schema.transactionEvidence)
    .innerJoin(schema.transactions, eq(schema.transactions.id, schema.transactionEvidence.transactionId))
    .where(eq(schema.transactionEvidence.evidenceId, evidenceId));
  if (!link) return NextResponse.json({ error: "evidence not found" }, { status: 404 });

  const [existing] = await db()
    .select()
    .from(schema.evidenceExtractions)
    .where(and(eq(schema.evidenceExtractions.evidenceId, evidenceId), eq(schema.evidenceExtractions.field, field)));

  const raw = value ?? (existing ? effectiveValue(existing) : null);
  if (!raw) return NextResponse.json({ error: "nothing to confirm; enter a value" }, { status: 400 });

  const check = validateField(field, raw, captureContext(link.tx));
  if (check.status === "rejected") {
    return NextResponse.json({ error: `Cannot use this value: ${check.note}` }, { status: 422 });
  }

  const values = { confirmedValue: check.aiValue ?? raw, status: check.status, checkNote: check.note };
  if (existing) {
    await db().update(schema.evidenceExtractions).set(values).where(eq(schema.evidenceExtractions.id, existing.id));
  } else {
    await db().insert(schema.evidenceExtractions).values({ evidenceId, field, aiValue: null, model: "manual", ...values });
  }

  const how = !existing ? "entered" : value && value !== existing.aiValue ? "edited" : "confirmed";
  await audit("seller", `field.${how}`, { type: "evidence", id: evidenceId }, { field, from: existing?.aiValue ?? null, to: values.confirmedValue, check: check.status });
  const result = await recomputeReadiness(link.tx.id);
  await proposeTracking(link.tx.id).catch((e) => console.error("auto-queue failed", e)); // queues only; the seller still approves
  return NextResponse.json({ field, status: check.status, note: check.note, score: result.score });
}
