import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { api } from "@/lib/api";

/** The seller's sales, newest first. */
export const GET = api({}, async () => {
  const rows = await db()
    .select()
    .from(schema.transactions)
    .orderBy(desc(schema.transactions.capturedAt))
    .limit(200);
  return NextResponse.json(rows);
});
