import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated once. Import ONLY from server code (route handlers, server
 * components) — never from client components.
 */
const schema = z.object({
  DATABASE_URL: z.string().url(),
  PAYPAL_CLIENT_ID: z.string().min(10),
  PAYPAL_CLIENT_SECRET: z.string().min(10),
  PAYPAL_API_BASE: z.string().url().default("https://api-m.sandbox.paypal.com"),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default("claude-sonnet-5-5"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TRANSCRIBE_MODEL: z.string().default("gpt-4o-transcribe"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  // Most AI calls (Claude and speech) the whole app may make per UTC day. Past it, AI routes answer 429.
  AI_DAILY_CALL_CAP: z.coerce.number().int().min(0).max(100_000).default(300),
  // How many reverse proxies sit in front of the app (Render: 1). Used to read the real client IP safely.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Names only: never echo a value, even a wrong one.
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${missing}. Copy .env.example to .env and fill it in.`);
  }
  if (!parsed.data.PAYPAL_API_BASE.includes("sandbox")) {
    // Safety net for the hackathon: this project only ever talks to the PayPal sandbox.
    throw new Error("PAYPAL_API_BASE must point at the PayPal sandbox (api-m.sandbox.paypal.com).");
  }
  cached = parsed.data;
  return cached;
}
