import { NextResponse } from "next/server";
import { z } from "zod";
import { captureOrder } from "@/lib/paypal/orders";
import { api, parseParam, jsonError } from "@/lib/api";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";

/** Captures the order and creates the transaction node of the proof graph. */
export const POST = api<{ orderId: string }>({ limit: "paypal-write" }, async ({ params }) => {
  const orderId = parseParam(params.orderId, z.string().regex(/^[A-Za-z0-9-]{8,40}$/), "order not found");
  const order = await captureOrder(orderId);
  const unit = order.purchase_units[0];
  const capture = unit?.payments?.captures?.[0];
  if (!capture) return jsonError(502, "No capture returned by PayPal");

  const [tx] = await db()
    .insert(schema.transactions)
    .values({
      paypalOrderId: order.id,
      paypalCaptureId: capture.id,
      amount: capture.amount.value,
      currency: capture.amount.currency_code,
      status: capture.status,
      buyerName: [order.payer?.name?.given_name, order.payer?.name?.surname].filter(Boolean).join(" ") || null,
      buyerEmail: order.payer?.email_address ?? null,
      shipToCity: unit.shipping?.address?.admin_area_2 ?? null,
      shipToCountry: unit.shipping?.address?.country_code ?? null,
      itemDescription: unit.description ?? null,
      capturedAt: capture.create_time ? new Date(capture.create_time) : new Date(),
    })
    .onConflictDoNothing({ target: schema.transactions.paypalCaptureId })
    .returning();

  if (tx) await audit("system", "transaction.captured", { type: "transaction", id: tx.id }, { orderId, captureId: capture.id });
  return NextResponse.json({ orderId: order.id, captureId: capture.id, status: capture.status, transactionId: tx?.id });
});
