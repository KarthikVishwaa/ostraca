import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { getPack } from "@/lib/limitation";

/** Builds the pack from PayPal's Transaction Search and the seller's proof record. Reads only; nothing is sent anywhere. */
export const GET = api({}, async () => {
  const pack = await getPack(0);
  await audit(
    "system",
    "limitation.report_read",
    { type: "limitation", id: "pack" },
    {
      search: pack.search.ok ? { ok: true, listed: pack.search.listed } : { ok: false, error: pack.search.error },
      sales: pack.summary.total,
      matched: pack.summary.matched,
    }
  );
  const activity = await db()
    .select()
    .from(schema.auditLogs)
    .where(eq(schema.auditLogs.entityType, "limitation"))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(40);
  const lastSimulation = activity.find((a) => a.event === "limitation.simulated")?.createdAt ?? null;
  return NextResponse.json({ pack, activity, lastSimulation, ai: { claude: !!env().ANTHROPIC_API_KEY } });
});
