import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { getAccessToken } from "@/lib/paypal/client";
import { db } from "@/db";

/** Drizzle wraps driver errors as "Failed query: ..."; the useful part is in .cause. */
function rootCause(e: unknown): string {
  let err = e as Error & { code?: string; cause?: unknown };
  while (err?.cause instanceof Error) err = err.cause as typeof err;
  return [err?.code, err?.message].filter(Boolean).join(" ");
}

/** One-glance setup check: open /api/health after filling in .env */
export async function GET() {
  const result: Record<string, string> = {};
  try {
    env();
    result.env = "ok";
  } catch (e) {
    return NextResponse.json({ env: (e as Error).message }, { status: 500 });
  }
  result.paypal = await getAccessToken().then(() => "ok", (e) => `error: ${(e as Error).message}`);
  result.database = await db().execute(sql`select 1`).then(() => "ok", (e) => `error: ${rootCause(e)}`);
  result.claude = env().ANTHROPIC_API_KEY ? "key present" : "missing ANTHROPIC_API_KEY";
  result.openai = env().OPENAI_API_KEY ? "key present (voice notes)" : "missing OPENAI_API_KEY (voice notes disabled)";
  return NextResponse.json(result);
}
