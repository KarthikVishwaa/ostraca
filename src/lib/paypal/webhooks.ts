import "server-only";
import { env } from "@/lib/env";
import { paypal } from "./client";

/**
 * Verifies a webhook with PayPal. Reject anything that doesn't return SUCCESS. Requires PAYPAL_WEBHOOK_ID
 * (from the Developer Dashboard → your app → Webhooks).
 */
export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  const webhookId = env().PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const res = await paypal<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
    json: {
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    },
  });
  return res.verification_status === "SUCCESS";
}
