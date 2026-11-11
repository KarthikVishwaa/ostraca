import { NextResponse } from "next/server";
import { PayPalError } from "@/lib/paypal/client";
import { DisputeIgnoredError } from "@/lib/data-reset";

export function paypalErrorResponse(e: unknown) {
  if (e instanceof DisputeIgnoredError) return NextResponse.json({ error: "dispute not found" }, { status: 404 });
  if (e instanceof PayPalError) {
    return NextResponse.json({ error: e.message, debug_id: e.debugId }, { status: e.status });
  }
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}
