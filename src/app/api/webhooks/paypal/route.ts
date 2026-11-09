import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/paypal/webhooks";
import { syncDispute } from "@/lib/disputes-sync";
import { audit } from "@/db/audit";

/**
 * PayPal webhook receiver (primary event path). Subscribe in the Developer Dashboard to:
 *   PAYMENT.CAPTURE.COMPLETED, CUSTOMER.DISPUTE.CREATED, CUSTOMER.DISPUTE.UPDATED, CUSTOMER.DISPUTE.RESOLVED
 * Dispute status is always re-read from PayPal — we never trust the event body alone.
 */
export async function POST(req: Request) {
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
    if (disputeId) await syncDispute(disputeId);
  }
  return NextResponse.json({ ok: true });
}
