import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { env } from "@/lib/env";
import { logError } from "@/lib/log";
import { isSameOrigin, isStateChanging } from "@/lib/origin";
import { PayPalError } from "@/lib/paypal/client";
import { DisputeIgnoredError } from "@/lib/data-reset";
import { clientIp, memoryGate, paypalWriteGate, type Denied } from "@/lib/rate-limit";

/**
 * The one error shape every route returns: { "error": { "message": "...", "code": "...", "debugId"?: "..."
 * } } with the right status: 400 bad input, 404 not found, 409 conflict, 413 too large, 415 wrong type,
 * 422 not allowed.
 */
const CODES: Record<number, string> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  409: "conflict",
  413: "too_large",
  415: "unsupported_type",
  422: "not_allowed",
  429: "rate_limited",
  500: "internal_error",
  502: "upstream_error",
  503: "unavailable",
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = CODES[status] ?? "error",
    public extra?: Record<string, unknown>
  ) {
    super(message);
  }
}
export const notFound = (what = "not found") => new HttpError(404, what);

/** A JSON error response in the shared shape. `extra` carries things like `problems` or `retryAfter` next to `error`. */
export function jsonError(status: number, message: string, opts: { code?: string; debugId?: string; extra?: Record<string, unknown>; headers?: Record<string, string> } = {}) {
  return NextResponse.json(
    { error: { message, code: opts.code ?? CODES[status] ?? "error", ...(opts.debugId ? { debugId: opts.debugId } : {}) }, ...(opts.extra ?? {}) },
    { status, headers: opts.headers }
  );
}

export function deniedResponse(d: Denied) {
  return jsonError(d.status, d.error, { code: d.code, extra: { retryAfter: d.retryAfter }, headers: { "Retry-After": String(d.retryAfter) } });
}

/** What PayPal's HTTP status means for us. Auth problems and PayPal outages are 502 (their side), the rest keep their meaning. */
function paypalStatus(s: number) {
  return [400, 404, 409, 422].includes(s) ? s : s === 429 ? 429 : 502;
}

export type ErrorInfo = { status: number; message: string; code: string; debugId?: string; extra?: Record<string, unknown> };

/** Maps any thrown value to what the browser may see. Unknown errors are logged (redacted) and become a plain 500 message. */
export function toErrorInfo(e: unknown): ErrorInfo {
  if (e instanceof HttpError) return { status: e.status, message: e.message, code: e.code, extra: e.extra };
  if (e instanceof ZodError) return { status: 400, message: "Invalid request.", code: "bad_request" };
  if (e instanceof DisputeIgnoredError) return { status: 404, message: "dispute not found", code: "not_found" };
  if (e instanceof PayPalError) {
    logError("PayPal error", e);
    const status = paypalStatus(e.status);
    return { status, message: e.message, code: status === 502 ? "upstream_error" : CODES[status] ?? "error", debugId: e.debugId };
  }
  logError("Unhandled route error", e);
  return { status: 500, message: "Something went wrong on our side. Please try again.", code: "internal_error" };
}

/** The ONLY error text a browser ever sees. The full (redacted) error goes to the server log. */
export function errorResponse(e: unknown) {
  const i = toErrorInfo(e);
  const retry = typeof i.extra?.retryAfter === "number" ? { "Retry-After": String(i.extra.retryAfter) } : undefined;
  return jsonError(i.status, i.message, { code: i.code, debugId: i.debugId, extra: i.extra, headers: retry });
}

type Limit = "read" | "edit" | "paypal-write" | "none";
type Options = {
  /** read: 240/min, edit: 120/min (in memory, per IP); paypal-write: 30/hour per IP (database, with an in-memory fallback). */
  limit?: Limit;
};

type Ctx<P> = { req: Request; ip: string; params: P };

/** Wraps a route handler with what every route needs, in one place (there are no accounts, so no login). */
export function api<P = Record<string, never>>(opts: Options, handler: (ctx: Ctx<P>) => Promise<Response>) {
  return async (req: Request, route: { params: Promise<P> }): Promise<Response> => {
    // Read the request before anything else: it marks the handler as dynamic, so it is never prerendered at build time.
    req.headers.get("cookie");
    try {
      if (isStateChanging(req.method) && !isSameOrigin(req, env().APP_URL)) {
        return jsonError(403, "Cross-site request blocked.");
      }
      const ip = clientIp(req);
      const limit = opts.limit ?? (isStateChanging(req.method) ? "edit" : "read");
      if (limit === "read" || limit === "edit") {
        const g = memoryGate(`${limit}:${ip}`, limit === "read" ? 240 : 120, 60);
        if (!g.ok) return deniedResponse(g);
      } else if (limit === "paypal-write") {
        const g = await paypalWriteGate(ip);
        if (!g.ok) return deniedResponse(g);
      }
      return await handler({ req, ip, params: await route.params });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Parse request input with zod; anything that does not fit is a 400 (never trusted, never echoed). */
export async function parseJson<T>(req: Request, schema: ZodType<T>, tooBig = 64_000): Promise<T> {
  const text = await req.text();
  if (text.length > tooBig) throw new HttpError(413, "Request body too large.");
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, "Invalid request.");
  return r.data;
}

export function parseParam<T>(value: unknown, schema: ZodType<T>, what = "not found"): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new HttpError(404, what); // a malformed id is just "not found"
  return r.data;
}
