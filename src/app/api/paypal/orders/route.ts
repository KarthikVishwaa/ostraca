import { NextResponse } from "next/server";
import { z } from "zod";
import { api, parseJson } from "@/lib/api";
import { createOrder } from "@/lib/paypal/orders";

const body = z.object({
  amount: z.string().regex(/^\d{1,6}(\.\d{1,2})?$/).default("120.00"),
  currency: z.literal("USD").default("USD"),
  description: z.string().trim().min(1).max(127).default("Handloom cotton saree (demo)"),
});

/** Creates a sandbox order. The amount and currency are validated; only USD sandbox orders can be made. */
export const POST = api({ limit: "paypal-write" }, async ({ req }) => {
  const input = await parseJson(req, body);
  const order = await createOrder(input);
  return NextResponse.json({ id: order.id });
});
