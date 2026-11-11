import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { api, notFound, parseParam } from "@/lib/api";
import { env } from "@/lib/env";
import { effectiveValue, isCounted, loadEvidence, recomputeReadiness } from "@/lib/proof";

/** Everything the sale detail page shows. Recomputes the score so it is never stale. */
export const GET = api<{ id: string }>({}, async ({ params }) => {
  const id = parseParam(params.id, z.string().uuid(), "transaction not found");
  const [transaction] = await db()
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, id));
  if (!transaction) throw notFound("transaction not found");

  const score = await recomputeReadiness(id);
  const evidence = (await loadEvidence(id)).map((e) => ({
    ...e,
    fields: e.fields.map((f) => ({ ...f, counted: isCounted(f), value: effectiveValue(f) })),
  }));
  const actions = await db()
    .select()
    .from(schema.agentActions)
    .where(eq(schema.agentActions.transactionId, id))
    .orderBy(desc(schema.agentActions.createdAt));

  const entityIds = [id, ...evidence.map((e) => e.id), ...actions.map((a) => a.id)];
  const activity = await db()
    .select()
    .from(schema.auditLogs)
    .where(inArray(schema.auditLogs.entityId, entityIds))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(100);

  const { ANTHROPIC_API_KEY, OPENAI_API_KEY } = env();
  return NextResponse.json({
    transaction: { ...transaction, readinessScore: score.score },
    readiness: { score: score.score, level: score.level, checks: score.checks },
    evidence,
    actions,
    activity,
    ai: { claude: !!ANTHROPIC_API_KEY, openai: !!OPENAI_API_KEY },
  });
});
