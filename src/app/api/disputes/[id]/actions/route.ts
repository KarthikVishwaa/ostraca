import { NextResponse } from "next/server";
import { z } from "zod";
import { api, HttpError, parseJson, parseParam, jsonError } from "@/lib/api";
import { disputeIdSchema, proposeEvidence } from "@/lib/dispute-proposal";

const body = z.object({ draft: z.string().trim().min(1).max(6000) });

/** Queue the (edited) draft as a pending "provide evidence" request. Queues only: PayPal is called after Approve. */
export const POST = api<{ id: string }>({}, async ({ req, params }) => {
  const id = parseParam(params.id, disputeIdSchema, "dispute not found");
  const input = await parseJson(req, body).catch(() => {
    throw new HttpError(400, "A non-empty draft is required.");
  });
  const r = await proposeEvidence(id, input.draft);
  if (!r.ok) return jsonError(r.status, r.reason, { extra: { problems: r.problems } });
  return NextResponse.json(r.action);
});
