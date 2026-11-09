import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/db/audit";

const body = z.object({ event: z.enum(["simulate", "export_print", "export_download"]) });

/** Records seller choices in the audit log. Nothing is sent to PayPal from here. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const name = { simulate: "limitation.simulated", export_print: "limitation.exported_print", export_download: "limitation.exported_download" }[parsed.data.event];
  await audit("seller", name, { type: "limitation", id: "pack" }, parsed.data.event === "simulate" ? { simulated: true, note: "No real limitation exists; sandbox cannot create one." } : { sentToPayPal: false });
  return NextResponse.json({ ok: true });
}
