import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/db/audit";
import { api, parseJson } from "@/lib/api";

const body = z.object({ event: z.enum(["simulate", "export_print", "export_download"]) });

/** Records seller choices in the audit log. Nothing is sent to PayPal from here. */
export const POST = api({}, async ({ req }) => {
  const input = await parseJson(req, body);
  const name = { simulate: "limitation.simulated", export_print: "limitation.exported_print", export_download: "limitation.exported_download" }[input.event];
  await audit("seller", name, { type: "limitation", id: "pack" }, input.event === "simulate" ? { simulated: true, note: "No real limitation exists; sandbox cannot create one." } : { sentToPayPal: false });
  return NextResponse.json({ ok: true });
});
