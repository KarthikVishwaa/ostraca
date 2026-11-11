import "server-only";
import { paypal } from "./client";

export type PayPalOrder = {
  id: string;
  status: string;
  payer?: { name?: { given_name?: string; surname?: string }; email_address?: string };
  purchase_units: Array<{
    description?: string;
    shipping?: { address?: { admin_area_2?: string; country_code?: string } };
    payments?: {
      captures?: Array<{ id: string; status: string; amount: { value: string; currency_code: string }; create_time?: string }>;
    };
  }>;
};

export function createOrder(input: { amount: string; currency: string; description: string }) {
  return paypal<PayPalOrder>("/v2/checkout/orders", {
    json: {
      intent: "CAPTURE",
      purchase_units: [
        {
          description: input.description.slice(0, 127),
          amount: { currency_code: input.currency, value: input.amount },
        },
      ],
    },
    idempotencyKey: crypto.randomUUID(),
  });
}

export function captureOrder(orderId: string) {
  return paypal<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    json: {},
    idempotencyKey: `capture-${orderId}`,
  });
}

/**
 * Orders v2 shipment tracking. carrier is a PayPal carrier enum (e.g. "INDIA_POST", "DHL", "FEDEX"). Use
 * carrier "OTHER" + carrierNameOther for anything not in the enum.
 */
export function addTracking(input: {
  orderId: string;
  captureId: string;
  trackingNumber: string;
  carrier: string;
  carrierNameOther?: string;
  idempotencyKey: string;
}) {
  return paypal(`/v2/checkout/orders/${encodeURIComponent(input.orderId)}/track`, {
    json: {
      capture_id: input.captureId,
      tracking_number: input.trackingNumber,
      carrier: input.carrier,
      ...(input.carrier === "OTHER" ? { carrier_name_other: input.carrierNameOther ?? "Other" } : {}),
      notify_payer: false,
    },
    idempotencyKey: input.idempotencyKey,
  });
}
