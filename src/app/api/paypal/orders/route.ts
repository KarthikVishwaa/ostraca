import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrder } from "@/lib/paypal/orders";
import { paypalErrorResponse } from "@/lib/http";

const body = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/).default("120.00"),
  currency: z.string().length(3).default("USD"),
  description: z.string().min(1).max(127).default("Handloom cotton saree (demo)"),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  try {
    const order = await createOrder(parsed.data);
    return NextResponse.json({ id: order.id });
  } catch (e) {
    return paypalErrorResponse(e);
  }
}
