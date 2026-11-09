import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifyWebhook } from "@/lib/paypal/webhooks";
import { syncDispute } from "@/lib/disputes-sync";
import { audit } from "@/db/audit";

/**
 * PayPal webhook receiver (the fast path; the disputes pages also poll PayPal every 10 seconds).
 * Subscribe in the Developer Dashboard to:
 *   PAYMENT.CAPTURE.COMPLETED, CUSTOMER.DISPUTE.CREATED, CUSTOMER.DISPUTE.UPDATED, CUSTOMER.DISPUTE.RESOLVED
 * The event body is never trusted for status: we verify the signature, then re-read the dispute from PayPal.
 */
export async function POST(req: Request) {
  // Without a webhook ID PayPal's signature cannot be verified, so no event is accepted.
  if (!env().PAYPAL_WEBHOOK_ID) {
    return NextResponse.json(
      {
        ok: false,
        error: "PAYPAL_WEBHOOK_ID is not set, so webhook signatures cannot be verified and events are ignored.",
        fallback: "Disputes are refreshed by polling PayPal every 10 seconds while a disputes page is open.",
      },
      { status: 503 }
    );
  }

  const event = await req.json().catch(() => null);
  if (!event?.event_type) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const verified = await verifyWebhook(req.headers, event).catch(() => false);
  if (!verified) {
    await audit("paypal_webhook", "webhook.rejected", undefined, { event_type: event.event_type, id: event.id });
    return NextResponse.json({ error: "signature verification failed" }, { status: 401 });
  }

  await audit("paypal_webhook", event.event_type, { type: "webhook", id: event.id });

  if (String(event.event_type).startsWith("CUSTOMER.DISPUTE.")) {
    const disputeId: string | undefined = event.resource?.dispute_id;
    if (disputeId) {
      try {
        await syncDispute(disputeId); // CREATED, UPDATED, RESOLVED all just trigger a fresh read
      } catch (e) {
        console.error("webhook dispute sync failed", e);
        return NextResponse.json({ error: "could not re-read the dispute from PayPal" }, { status: 500 }); // PayPal will retry
      }
    }
  }
  return NextResponse.json({ ok: true });
}
