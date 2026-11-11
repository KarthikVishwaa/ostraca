import { NextResponse } from "next/server";
import { z } from "zod";
import { api, jsonError, parseParam } from "@/lib/api";
import { proposeTracking } from "@/lib/tracking-proposal";

/** The seller asks to (re)queue the tracking request. Queues only: nothing reaches PayPal until they approve it. */
export const POST = api<{ id: string }>({}, async ({ params }) => {
  const id = parseParam(params.id, z.string().uuid(), "transaction not found");
  const p = await proposeTracking(id, { revive: true });
  if (!p.ok) return jsonError(p.reason === "transaction not found" ? 404 : p.reason.startsWith("Tracking is already") ? 409 : 422, p.reason);
  return NextResponse.json(p.action);
});
