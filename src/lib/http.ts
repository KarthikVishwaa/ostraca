import { NextResponse } from "next/server";
import { PayPalError } from "@/lib/paypal/client";

export function paypalErrorResponse(e: unknown) {
  if (e instanceof PayPalError) {
    return NextResponse.json({ error: e.message, debug_id: e.debugId }, { status: e.status });
  }
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}
