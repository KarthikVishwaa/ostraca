import { NextResponse } from "next/server";
import { z } from "zod";
import { paypalErrorResponse } from "@/lib/http";
import { disputeIdSchema, proposeEvidence } from "@/lib/dispute-proposal";

const body = z.object({ draft: z.string().trim().min(1).max(6000) });

/** Queue the (edited) draft as a pending "provide evidence" request. Queues only: PayPal is called after Approve. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = disputeIdSchema.safeParse((await ctx.params).id);
  const input = body.safeParse(await req.json().catch(() => null));
  if (!id.success || !input.success) return NextResponse.json({ error: "A non-empty draft is required." }, { status: 400 });
  try {
    const r = await proposeEvidence(id.data, input.data.draft);
    if (!r.ok) return NextResponse.json({ error: r.reason, problems: r.problems }, { status: r.status });
    return NextResponse.json(r.action);
  } catch (e) {
    return paypalErrorResponse(e);
  }
}
