import "server-only";

/**
 * Turns an error from Claude or OpenAI into a short, honest sentence for the seller. The raw error is
 * logged (redacted) elsewhere and never shown. Used whenever the plain template is used instead of AI.
 */
export function describeAiFailure(e: unknown): string {
  const err = e as { status?: number; message?: string; name?: string; code?: string } | null;
  const msg = String(err?.message ?? "").toLowerCase();
  const status = typeof err?.status === "number" ? err.status : undefined;
  if (msg.includes("is not set")) return "AI is not set up (no API key)";
  if (status === 401 || status === 403 || msg.includes("api key") || msg.includes("authentication")) return "the AI key was rejected";
  if (msg.includes("credit") || msg.includes("billing") || msg.includes("quota") || status === 402) return "the AI account is out of credit";
  if (status === 429 || msg.includes("rate limit") || msg.includes("overloaded") || status === 529) return "the AI service is busy right now";
  if (status && status >= 500) return "the AI service had a problem";
  if (err?.name === "APIConnectionError" || err?.name === "APIConnectionTimeoutError" || msg.includes("fetch failed") || msg.includes("econn") || msg.includes("enotfound") || msg.includes("timeout") || msg.includes("connection")) {
    return "the AI service could not be reached";
  }
  return "the AI service did not answer properly";
}

/** The sentence shown next to a template that was used instead of AI. */
export const templateNotice = (why: string, what: "facts" | "numbers") => `AI could not write this (${why}), so here is a plain template built from your ${what}. It goes through the same checks.`;
