import "server-only";
import { env } from "@/lib/env";

/**
 * Minimal, typed PayPal REST client (sandbox only).
 * - Caches the OAuth token until shortly before it expires.
 * - Sends PayPal-Request-Id on writes so retries can't double-submit.
 * - Throws PayPalError with PayPal's debug_id, which you need when asking PayPal for help.
 */

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
    public debugId?: string
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

let token: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt - 60_000) return token.value;
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_API_BASE } = env();
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new PayPalError("PayPal auth failed — check client ID/secret", res.status, body);
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return token.value;
}

type Options = {
  method?: "GET" | "POST" | "PATCH";
  json?: unknown;
  form?: FormData;
  idempotencyKey?: string;
  query?: Record<string, string | number | undefined>;
};

export async function paypal<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const { PAYPAL_API_BASE } = env();
  const url = new URL(PAYPAL_API_BASE + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));

  const headers: Record<string, string> = {
    Authorization: `Bearer ${await getAccessToken()}`,
    Prefer: "return=representation",
  };
  if (opts.json !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) headers["PayPal-Request-Id"] = opts.idempotencyKey;

  const res = await fetch(url, {
    method: opts.method ?? (opts.json !== undefined || opts.form ? "POST" : "GET"),
    headers,
    body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
    cache: "no-store",
  });

  const text = await res.text();
  const body = text ? safeJson(text) : {};
  if (!res.ok) {
    const b = body as { name?: string; message?: string; debug_id?: string; details?: Array<{ issue?: string; description?: string; field?: string }> };
    // PayPal often hides the real reason in details[] behind a generic message.
    const why = (b.details ?? []).map((d) => [d.field, d.issue, d.description].filter(Boolean).join(" ")).filter(Boolean).join("; ");
    throw new PayPalError(`${b.name ?? "PAYPAL_ERROR"}: ${b.message ?? res.statusText}${why ? ` (${why})` : ""}`, res.status, body, b.debug_id);
  }
  return body as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export type HateoasLink = { href: string; rel: string; method?: string };

/** True if PayPal currently allows this action (e.g. "provide_evidence", "adjudicate"). */
export function hasLink(links: HateoasLink[] | undefined, rel: string) {
  return !!links?.some((l) => l.rel === rel);
}
