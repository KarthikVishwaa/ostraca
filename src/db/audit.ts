import "server-only";
import { db, schema } from "./index";

/** Append-only log. Details are stored as given: never put secrets, tokens or file contents in them. */
export async function audit(
  actor: "seller" | "system" | "ai" | "paypal_webhook",
  event: string,
  entity?: { type: string; id: string },
  details?: unknown
) {
  await db()
    .insert(schema.auditLogs)
    .values({ actor, event, entityType: entity?.type, entityId: entity?.id, details: details ?? null });
}
