import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { getAccessToken } from "@/lib/paypal/client";
import { db } from "@/db";
import { logError } from "@/lib/log";
import { deniedResponse, jsonError } from "@/lib/api";
import { clientIp, memoryGate } from "@/lib/rate-limit";

/**
 * One-glance setup check. Public on purpose (the header status light uses it), so it answers with "ok" or
 * "problem" only: no error text, no key names, no hostnames. Details go to the server log.
 */
// The header's status light asks on every page load, so the answer is shared for 10 seconds: a person clicking
// around (or several tabs) costs one real check, not one per page, and never runs into the rate limit.
let cached: { at: number; body: Record<string, "ok" | "problem"> } | null = null;
const TTL_MS = 10_000;

export async function GET(req: Request) {
  const gate = memoryGate(`health:${clientIp(req)}`, 120, 60);
  if (!gate.ok) return deniedResponse(gate);
  if (cached && Date.now() - cached.at < TTL_MS) return NextResponse.json(cached.body);

  const result: Record<string, "ok" | "problem"> = {};
  try {
    env();
    result.env = "ok";
  } catch (e) {
    logError("health: env invalid", e);
    return jsonError(503, "The server settings are incomplete.", { extra: { env: "problem" } });
  }
  result.paypal = await getAccessToken().then(
    () => "ok" as const,
    (e) => {
      logError("health: paypal", e);
      return "problem" as const;
    }
  );
  result.database = await db()
    .execute(sql`select 1`)
    .then(
      () => "ok" as const,
      (e) => {
        logError("health: database", e);
        return "problem" as const;
      }
    );
  result.claude = env().ANTHROPIC_API_KEY ? "ok" : "problem";
  result.openai = env().OPENAI_API_KEY ? "ok" : "problem";
  cached = { at: Date.now(), body: result };
  return NextResponse.json(result);
}
