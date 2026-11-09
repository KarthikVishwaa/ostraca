import { z } from "zod";

/**
 * Server-side environment, validated once. Import ONLY from server code
 * (route handlers, server components, scripts) — never from client components.
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
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
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
