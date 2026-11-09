import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";

/**
 * APPROVAL QUEUE (agent_actions). Every PayPal write is proposed here as `pending`,
 * approved by the seller, and only then executed. This module never calls PayPal.
 * The idempotency key is unique, so proposing the same thing twice returns the same row.
 */
export async function proposeAction(
  input: {
    type: string;
    transactionId: string;
    disputeId?: string; // agent_actions.dispute_id (the disputes row), for dispute actions
    payload: Record<string, unknown>;
    idempotencyKey: string;
  },
  opts: { revive?: boolean } = {}
) {
  const [created] = await db()
    .insert(schema.agentActions)
    .values({ ...input, status: "pending" })
    .onConflictDoNothing({ target: schema.agentActions.idempotencyKey })
    .returning();
  if (created) {
    await audit("system", "action.proposed", { type: "agent_action", id: created.id }, { type: input.type, payload: input.payload });
    return created;
  }
  const [existing] = await db().select().from(schema.agentActions).where(eq(schema.agentActions.idempotencyKey, input.idempotencyKey));
  if (opts.revive && existing?.status === "rejected") {
    const [again] = await db().update(schema.agentActions).set({ status: "pending", error: null }).where(eq(schema.agentActions.id, existing.id)).returning();
    await audit("seller", "action.requeued", { type: "agent_action", id: existing.id });
    return again;
  }
  return existing;
}

/** pending → approved (or failed → approved, to retry). Returns null if it is not approvable (e.g. already executed). */
export async function approveAction(id: string, by = "seller") {
  const [row] = await db()
    .update(schema.agentActions)
    .set({ status: "approved", approvedBy: by, approvedAt: new Date(), error: null })
    .where(and(eq(schema.agentActions.id, id), inArray(schema.agentActions.status, ["pending", "failed"])))
    .returning();
  if (row) await audit("seller", "action.approved", { type: "agent_action", id }, { type: row.type });
  return row ?? null;
}

export async function rejectAction(id: string) {
  const [row] = await db()
    .update(schema.agentActions)
    .set({ status: "rejected" })
    .where(and(eq(schema.agentActions.id, id), eq(schema.agentActions.status, "pending")))
    .returning();
  if (row) await audit("seller", "action.rejected", { type: "agent_action", id });
  return row ?? null;
}

export async function markExecuted(id: string, paypalResponse: unknown) {
  await db()
    .update(schema.agentActions)
    .set({ status: "executed", paypalResponse: paypalResponse ?? null, error: null })
    .where(eq(schema.agentActions.id, id));
  await audit("system", "action.executed", { type: "agent_action", id }, { paypalResponse: paypalResponse ?? null });
}

export async function markFailed(id: string, error: string) {
  await db().update(schema.agentActions).set({ status: "failed", error }).where(eq(schema.agentActions.id, id));
  await audit("system", "action.failed", { type: "agent_action", id }, { error });
}

export async function getAction(id: string) {
  const [row] = await db().select().from(schema.agentActions).where(eq(schema.agentActions.id, id));
  return row ?? null;
}
