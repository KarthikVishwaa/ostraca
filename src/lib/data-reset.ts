import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * After `npm run db:reset --yes`, PayPal still holds the old sandbox disputes. The reset writes one
 * "data_reset" audit event, and anything PayPal created before it is treated as not existing here.
 */
export const RESET_EVENT = "data_reset"; // same string as scripts/reset-data.ts

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
