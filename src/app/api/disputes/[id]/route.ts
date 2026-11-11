import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { api, parseParam } from "@/lib/api";
import { env } from "@/lib/env";
import { hasLink } from "@/lib/paypal/client";
import { disputeIdSchema, loadDispute } from "@/lib/dispute-proposal";

/** Everything the dispute page shows. It re-reads the dispute from PayPal on every call. */
export const GET = api<{ id: string }>({}, async ({ params }) => {
  const id = parseParam(params.id, disputeIdSchema, "dispute not found");
  const d = await loadDispute(id);
  const { detail, sale, row, built } = d;

  const actions = await db()
    .select()
    .from(schema.agentActions)
    .where(and(eq(schema.agentActions.disputeId, row.id), eq(schema.agentActions.type, "provide_evidence")))
    .orderBy(desc(schema.agentActions.createdAt));
  const activity = await db()
    .select()
    .from(schema.auditLogs)
    .where(inArray(schema.auditLogs.entityId, [detail.dispute_id, ...actions.map((a) => a.id)]))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(100);

  const { ANTHROPIC_API_KEY, PAYPAL_API_BASE } = env();
  return NextResponse.json({
    dispute: {
      id: detail.dispute_id,
      status: detail.status,
      state: detail.dispute_state ?? null,
      stage: detail.dispute_life_cycle_stage ?? null,
      reason: detail.reason,
      amount: detail.dispute_amount ?? null,
      due: detail.seller_response_due_date ?? null,
      outcome: detail.dispute_outcome?.outcome_code ?? null,
      created: detail.create_time ?? null,
      messages: (detail.messages ?? []).map((m) => ({ by: m.posted_by, content: m.content, time: m.time_posted })),
      can: {
        provideEvidence: hasLink(detail.links, "provide_evidence"),
        adjudicate: hasLink(detail.links, "adjudicate"),
      },
      syncedAt: row.lastSyncedAt,
    },
    sale: sale
      ? {
          id: sale.id,
          item: sale.itemDescription,
          amount: sale.amount,
          currency: sale.currency,
          buyer: sale.buyerName,
          captureId: sale.paypalCaptureId,
          readinessScore: sale.readinessScore,
          trackingFiled: sale.trackingFiled,
        }
      : null,
    evidence: (built?.evidence ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      fileName: e.fileName,
      sha256: e.sha256,
      uploadedAt: e.uploadedAt,
      usedFor: e.usedFor,
    })),
    facts: built?.facts ?? [],
    missing: built?.missing ?? [],
    hasProof: built?.hasProof ?? false,
    actions,
    activity,
    ai: { claude: !!ANTHROPIC_API_KEY },
    sandbox: PAYPAL_API_BASE.includes("sandbox"),
  });
});
