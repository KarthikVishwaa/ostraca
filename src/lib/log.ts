import "server-only";

/**
 * Logging that never prints a secret. Everything that goes to the server log passes through `redact`: the
 * values of our own secrets, plus anything shaped like an API key, bearer token or database password.
 */
const SECRET_ENV = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "PAYPAL_CLIENT_SECRET", "DATABASE_URL", "PAYPAL_WEBHOOK_ID"] as const;

const PATTERNS: Array<[RegExp, string]> = [
  [/sk-ant-[A-Za-z0-9_-]{8,}/g, "[redacted-key]"],
  [/sk-[A-Za-z0-9_-]{16,}/g, "[redacted-key]"],
  [/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]"],
  [/Basic\s+[A-Za-z0-9+/=]{12,}/gi, "Basic [redacted]"],
  [/postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]+@/gi, "postgres://[redacted]@"],
  [/("?(?:client_)?secret"?\s*[:=]\s*"?)[^"\s,}]{6,}/gi, "$1[redacted]"],
  [/(access_token"?\s*[:=]\s*"?)[A-Za-z0-9._-]{8,}/gi, "$1[redacted]"],
];

export function redact(input: unknown): string {
  let text = typeof input === "string" ? input : input instanceof Error ? `${input.name}: ${input.message}\n${input.stack ?? ""}` : safeStringify(input);
  for (const name of SECRET_ENV) {
    const v = process.env[name];
    if (v && v.length >= 8) text = text.split(v).join("[redacted]");
  }
  for (const [re, sub] of PATTERNS) text = text.replace(re, sub);
  return text;
}

function safeStringify(x: unknown) {
  try {
    return JSON.stringify(x) ?? String(x);
  } catch {
    return String(x);
  }
}

/** Use instead of console.error for anything that may contain an error from a library. */
export function logError(label: string, e?: unknown) {
  console.error(label, e === undefined ? "" : redact(e));
}
