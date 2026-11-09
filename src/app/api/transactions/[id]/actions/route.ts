import { NextResponse } from "next/server";
import { proposeTracking } from "@/lib/tracking-proposal";

/** The seller asks to (re)queue the tracking request. Queues only: nothing reaches PayPal until they approve it. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await proposeTracking(id, { revive: true });
  if (!p.ok) return NextResponse.json({ error: p.reason }, { status: p.reason === "transaction not found" ? 404 : p.reason.startsWith("Tracking is already") ? 409 : 422 });
  return NextResponse.json(p.action);
}
