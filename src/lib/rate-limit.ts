import "server-only";
import { isIP } from "node:net";
import { and, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { logError } from "@/lib/log";
import { AI_PER_IP_PER_DAY, AI_PER_IP_PER_HOUR, DAY, HOUR, PAYPAL_WRITE_PER_HOUR, aiKeys, paypalWriteKey, windowStartMs } from "@/lib/rate-keys";

export type Denied = { ok: false; status: 429; code: "rate_limited" | "ai_paused"; error: string; retryAfter: number };
export type Allowed = { ok: true };

const minutes = (sec: number) => (sec <= 90 ? "a minute" : `about ${Math.ceil(sec / 60)} minutes`);

function denied(retryAfter: number, what: string): Denied {
  return {
    ok: false,
    status: 429,
    code: "rate_limited",
    error: `${what} Please try again in ${minutes(retryAfter)}.`,
    retryAfter,
  };
}

/** The caller's IP address, read safely from X-Forwarded-For. */
export function clientIp(req: Request): string {
  const hops = env().TRUSTED_PROXY_HOPS;
  if (hops === 0) return "direct";
  const parts = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "unknown";
  const ip = parts[Math.max(0, parts.length - hops)];
  return isIP(ip) ? ip : "unknown";
}

const fallback = new Map<string, number>(); // key|windowStart -> count, used only while the database counter is unavailable
let warned = false;

/** Increments a fixed-window counter and returns the new count and the seconds until the window ends. */
async function hit(key: string, windowSec: number) {
  const start = windowStartMs(windowSec);
  const retryAfter = Math.max(1, Math.ceil((start + windowSec * 1000 - Date.now()) / 1000));
  try {
    const [row] = await db()
      .insert(schema.rateLimits)
      .values({ key, windowStart: new Date(start), count: 1 })
      .onConflictDoUpdate({ target: [schema.rateLimits.key, schema.rateLimits.windowStart], set: { count: sql`${schema.rateLimits.count} + 1` } })
      .returning({ count: schema.rateLimits.count });
    // Old windows are useless; sweep them now and then so the table stays tiny.
    if (Math.random() < 0.01) {
      await db()
        .delete(schema.rateLimits)
        .where(and(lt(schema.rateLimits.windowStart, new Date(Date.now() - 2 * DAY * 1000))))
        .catch(() => null);
    }
    return { count: row.count, retryAfter };
  } catch (e) {
    if (!warned) {
      warned = true;
      logError("rate limiter: database counter unavailable, using in-memory counters (run `npm run db:push`)", e);
    }
    const k = `${key}|${start}`;
    if (fallback.size > 5000) fallback.clear();
    const count = (fallback.get(k) ?? 0) + 1;
    fallback.set(k, count);
    return { count, retryAfter };
  }
}

/**
 * AI cost protection. Per-IP limits are checked first so one noisy client cannot use up the shared daily
 * budget, then the global daily cap (env AI_DAILY_CALL_CAP).
 */
export async function aiGate(ip: string): Promise<Allowed | Denied> {
  const hour = await hit(aiKeys.ipHour(ip), HOUR);
  if (hour.count > AI_PER_IP_PER_HOUR) return denied(hour.retryAfter, `You have used ${AI_PER_IP_PER_HOUR} AI requests this hour.`);
  const day = await hit(aiKeys.ipDay(ip), DAY);
  if (day.count > AI_PER_IP_PER_DAY) return denied(day.retryAfter, `You have used ${AI_PER_IP_PER_DAY} AI requests today.`);

  const global = await hit(aiKeys.globalDay(), DAY);
  if (global.count > env().AI_DAILY_CALL_CAP) {
    return {
      ok: false,
      status: 429,
      code: "ai_paused",
      error: "AI is paused for today. You can still type details in by hand, and plain templates still work.",
      retryAfter: global.retryAfter,
    };
  }
  return { ok: true };
}

/** Limit for routes that write to PayPal (create or capture an order, approve an action, sandbox steps). */
export async function paypalWriteGate(ip: string): Promise<Allowed | Denied> {
  const r = await hit(paypalWriteKey(ip), HOUR);
  return r.count > PAYPAL_WRITE_PER_HOUR ? denied(r.retryAfter, `Too many PayPal requests from this address this hour (limit ${PAYPAL_WRITE_PER_HOUR}).`) : { ok: true };
}

// Cheap routes: an in-memory counter is enough (no money is spent). Per server process.
const buckets = new Map<string, { n: number; reset: number }>();

export function memoryGate(key: string, max: number, windowSec: number): Allowed | Denied {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowSec * 1000 });
    return { ok: true };
  }
  b.n++;
  return b.n > max ? denied(Math.ceil((b.reset - now) / 1000), "Too many requests.") : { ok: true };
}
