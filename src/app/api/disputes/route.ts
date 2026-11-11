import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { listDisputes } from "@/lib/paypal/disputes";
import { paypalErrorResponse } from "@/lib/http";
import { syncDispute } from "@/lib/disputes-sync";
import { db, schema } from "@/db";
import { latestResetAt, predatesReset } from "@/lib/data-reset";

/**
 * Lists disputes straight from PayPal (status and stage are always PayPal's), each with the linked sale.
 * PayPal's list call does not include the action links, so what the seller can DO is decided on the detail page.
 * A dispute we have not seen, or have not matched to a sale yet, is synced here (one detail read each).
 */
export async function GET() {
  try {
    const resetAt = await latestResetAt();
    // Disputes PayPal created before the last data reset are not shown at all, not even as "No matching sale".
    const items = ((await listDisputes()).items ?? []).filter((d) => !predatesReset(d.create_time, resetAt));
    const ids = items.map((d) => d.dispute_id);
    let rows = ids.length ? await db().select().from(schema.disputes).where(inArray(schema.disputes.paypalDisputeId, ids)) : [];

    const todo = ids.filter((id) => !rows.find((r) => r.paypalDisputeId === id)?.transactionId);
    for (const id of todo) await syncDispute(id).catch((e) => console.error("sync failed", id, e));
    if (todo.length) rows = await db().select().from(schema.disputes).where(inArray(schema.disputes.paypalDisputeId, ids));

    const saleIds = rows.map((r) => r.transactionId).filter((x): x is string => !!x);
    const sales = saleIds.length ? await db().select().from(schema.transactions).where(inArray(schema.transactions.id, saleIds)) : [];

    return NextResponse.json(
      items.map((d) => {
        const row = rows.find((r) => r.paypalDisputeId === d.dispute_id);
        const sale = sales.find((s) => s.id === row?.transactionId);
        return {
          id: d.dispute_id,
          reason: d.reason,
          status: d.status,
          stage: d.dispute_life_cycle_stage ?? null,
          amount: d.dispute_amount ?? null,
          created: d.create_time ?? null,
          sale: sale ? { id: sale.id, item: sale.itemDescription, readinessScore: sale.readinessScore } : null,
        };
      })
    );
  } catch (e) {
    return paypalErrorResponse(e);
  }
}
