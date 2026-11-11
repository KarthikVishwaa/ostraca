import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * After `npm run db:reset --yes`, PayPal still holds the old sandbox disputes. The reset writes one
 * "data_reset" audit event, and anything PayPal created before it is treated as not existing here.
 */
export const RESET_EVENT = "data_reset"; // same string as scripts/reset-data.ts
/** Written by scripts/import-dispute.ts. A dispute with this event is shown even if PayPal created it before the last reset. */
export const DISPUTE_IMPORT_EVENT = "dispute imported from PayPal";

export class DisputeIgnoredError extends Error {
  constructor(id: string) {
    super(`dispute ${id} was created before the last data reset`);
    this.name = "DisputeIgnoredError";
  }
}

export async function latestResetAt(): Promise<Date | null> {
  const [row] = await db()
    .select({ at: schema.auditLogs.createdAt })
    .from(schema.auditLogs)
    .where(eq(schema.auditLogs.event, RESET_EVENT))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(1);
  return row?.at ?? null;
}

/** True when PayPal created the dispute before the last reset. A dispute with no create_time is never hidden. */
export function predatesReset(createTime: string | null | undefined, resetAt: Date | null) {
  return !!resetAt && !!createTime && new Date(createTime).getTime() < resetAt.getTime();
}

/** Which of these dispute IDs were deliberately imported from PayPal (so the reset filter must not hide them). */
export async function importedDisputeIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db()
    .select({ id: schema.auditLogs.entityId })
    .from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.event, DISPUTE_IMPORT_EVENT), inArray(schema.auditLogs.entityId, ids)));
  return new Set(rows.map((r) => r.id).filter((x): x is string => !!x));
}
