import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";

export async function GET() {
  const rows = await db().select().from(schema.transactions).orderBy(desc(schema.transactions.capturedAt)).limit(200);
  return NextResponse.json(rows);
}
