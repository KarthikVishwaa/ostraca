import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";
import { api, HttpError, parseJson, parseParam, jsonError } from "@/lib/api";
import { logError } from "@/lib/log";
import { MANUAL_FIELDS, validateField } from "@/lib/validation";
import { proposeTracking } from "@/lib/tracking-proposal";
import { captureContext, effectiveValue, recomputeReadiness } from "@/lib/proof";

const body = z.object({
  field: z.enum(MANUAL_FIELDS),
  /** Omit to confirm the suggested value as-is; send a value to edit it (or to enter one manually). */
  value: z.string().trim().min(1).max(200).optional(),
});

/**
 * Seller confirms, edits, or manually enters one field. Edits are re-checked by the same deterministic
 * rules as AI suggestions; a rejected value can never be confirmed.
 */
export const PATCH = api<{ id: string }>({}, async ({ req, params }) => {
  const evidenceId = parseParam(params.id, z.string().uuid(), "evidence not found");
  const { field, value } = await parseJson(req, body).catch(() => {
    throw new HttpError(400, "field and a non-empty value are required");
  });

  // The evidence must be linked to a sale.
  const [link] = await db()
    .select({ tx: schema.transactions })
    .from(schema.transactionEvidence)
    .innerJoin(schema.transactions, eq(schema.transactions.id, schema.transactionEvidence.transactionId))
    .where(eq(schema.transactionEvidence.evidenceId, evidenceId));
  if (!link) throw new HttpError(404, "evidence not found");

  const [existing] = await db()
    .select()
    .from(schema.evidenceExtractions)
    .where(and(eq(schema.evidenceExtractions.evidenceId, evidenceId), eq(schema.evidenceExtractions.field, field)));

  const raw = value ?? (existing ? effectiveValue(existing) : null);
  if (!raw) throw new HttpError(400, "nothing to confirm; enter a value");

  const check = validateField(field, raw, captureContext(link.tx));
  if (check.status === "rejected") {
    return jsonError(422, `Cannot use this value: ${check.note}`);
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
  await proposeTracking(link.tx.id).catch((e) => logError("auto-queue failed", e)); // queues only; the seller still approves
  return NextResponse.json({ field, status: check.status, note: check.note, score: result.score });
});
