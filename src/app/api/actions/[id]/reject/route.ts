import { NextResponse } from "next/server";
import { rejectAction } from "@/lib/approvals";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await rejectAction(id);
  if (!row) return NextResponse.json({ error: "This action is not waiting for approval" }, { status: 409 });
  return NextResponse.json({ status: "rejected" });
}
