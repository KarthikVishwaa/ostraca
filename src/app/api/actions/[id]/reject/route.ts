import { NextResponse } from "next/server";
import { z } from "zod";
import { api, notFound, parseParam, jsonError } from "@/lib/api";
import { getAction, rejectAction } from "@/lib/approvals";

export const POST = api<{ id: string }>({}, async ({ params }) => {
  const id = parseParam(params.id, z.string().uuid(), "action not found");
  if (!(await getAction(id))) throw notFound("action not found");
  const row = await rejectAction(id);
  if (!row) return jsonError(409, "This action is not waiting for approval");
  return NextResponse.json({ status: "rejected" });
});
