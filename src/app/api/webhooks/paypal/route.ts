import { errorResponse, jsonError } from "@/lib/api";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { verifyWebhook } from "@/lib/paypal/webhooks";
import { syncDispute } from "@/lib/disputes-sync";
import { audit } from "@/db/audit";
import { db, schema } from "@/db";
import { DisputeIgnoredError } from "@/lib/data-reset";
import { logError } from "@/lib/log";
import { deniedResponse } from "@/lib/api";
import { clientIp, memoryGate } from "@/lib/rate-limit";

/** PayPal webhook receiver (the fast path; the disputes pages also poll PayPal every 10 seconds). */
export async function POST(req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (e) {
    return errorResponse(e); // never a bare 500
  }
}

async function handle(req: Request): Promise<Response> {
  const gate = memoryGate(`webhook:${clientIp(req)}`, 120, 60);
  if (!gate.ok) return deniedResponse({ ok: false, status: 429, code: "rate_limited", error: "Too many requests.", retryAfter: gate.retryAfter });

  // Without a webhook ID PayPal's signature cannot be verified, so no event is accepted.
  if (!env().PAYPAL_WEBHOOK_ID) {
    return jsonError(503, "PAYPAL_WEBHOOK_ID is not set, so webhook signatures cannot be verified and events are ignored.", {
      extra: { ok: false, fallback: "Disputes are refreshed by polling PayPal every 10 seconds while a disputes page is open." },
    });
  }

  const text = await req.text();
  if (text.length > 200_000) return jsonError(413, "payload too large");
  let event: { id?: unknown; event_type?: unknown; resource?: { dispute_id?: unknown } } | null = null;
  try {
    event = JSON.parse(text);
  } catch {
    event = null;
  }
  if (!event || typeof event.event_type !== "string" || typeof event.id !== "string") return jsonError(400, "bad payload");

  const verified = await verifyWebhook(req.headers, event).catch(() => false);
  if (!verified) {
    await audit("paypal_webhook", "webhook.rejected", undefined, { event_type: event.event_type.slice(0, 80) });
    return jsonError(401, "signature verification failed");
  }

  // Replay protection: the first delivery of an event ID wins; a duplicate or replay is acknowledged and ignored.
  const claimed = await db().insert(schema.webhookEvents).values({ eventId: event.id.slice(0, 100), eventType: event.event_type.slice(0, 100) }).onConflictDoNothing().returning({ id: schema.webhookEvents.eventId });
  if (!claimed.length) return NextResponse.json({ ok: true, duplicate: true });

  if (event.event_type.startsWith("CUSTOMER.DISPUTE.")) {
    const disputeId = typeof event.resource?.dispute_id === "string" ? event.resource.dispute_id : undefined;
    if (disputeId && /^[A-Za-z0-9-]{6,40}$/.test(disputeId)) {
      try {
        await syncDispute(disputeId); // CREATED, UPDATED, RESOLVED all just trigger a fresh read
      } catch (e) {
        if (!(e instanceof DisputeIgnoredError)) {
          logError("webhook dispute sync failed", e);
          // Let PayPal retry: release the claim so the retry is not mistaken for a duplicate.
          await db().delete(schema.webhookEvents).where(eq(schema.webhookEvents.eventId, event.id.slice(0, 100)));
          return jsonError(502, "could not re-read the dispute from PayPal");
        }
        return NextResponse.json({ ok: true, ignored: "dispute predates the last data reset" });
      }
    }
  }
  await audit("paypal_webhook", event.event_type, { type: "webhook", id: event.id });
  return NextResponse.json({ ok: true });
}
