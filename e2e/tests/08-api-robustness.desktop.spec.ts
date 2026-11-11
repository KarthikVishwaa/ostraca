import { expect, test } from "../fixtures";

// Test 8: bad input to every /api route. Never a 500, always JSON with error.message, always the right status.
// (The 429 rate limit and the AI daily cap are tested on the dedicated servers in test 11.)
const U = "00000000-0000-4000-8000-000000000000";
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);

type Case = { name: string; method: string; path: string; json?: unknown; raw?: string; multipart?: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>; expect: number[]; noOrigin?: boolean };

const cases: Case[] = [
  { name: "sale: not a uuid", method: "GET", path: "/api/transactions/not-a-uuid", expect: [404] },
  { name: "sale: unknown id", method: "GET", path: `/api/transactions/${U}`, expect: [404] },
  { name: "queue tracking: unknown sale", method: "POST", path: `/api/transactions/${U}/actions`, expect: [404] },
  { name: "queue tracking: not a uuid", method: "POST", path: "/api/transactions/nope/actions", expect: [404] },
  { name: "upload: nothing sent", method: "POST", path: "/api/evidence", multipart: {}, expect: [400] },
  { name: "upload: text file claiming to be a PNG", method: "POST", path: "/api/evidence", multipart: { transactionId: U, file: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("hello, this is not an image at all") } }, expect: [415] },
  { name: "upload: PNG for an unknown sale", method: "POST", path: "/api/evidence", multipart: { transactionId: U, mode: "manual", file: { name: "a.png", mimeType: "image/png", buffer: PNG_HEAD } }, expect: [404] },
  { name: "manual entry: empty body", method: "POST", path: "/api/evidence/manual", json: {}, expect: [400] },
  { name: "manual entry: not JSON", method: "POST", path: "/api/evidence/manual", raw: "this is not json", expect: [400] },
  { name: "manual entry: oversized body", method: "POST", path: "/api/evidence/manual", raw: JSON.stringify({ transactionId: U, trackingNumber: "x".repeat(70_000), carrier: "y" }), expect: [413, 400] },
  { name: "manual entry: wrong types", method: "POST", path: "/api/evidence/manual", json: { transactionId: 5, trackingNumber: [], carrier: {} }, expect: [400] },
  { name: "manual entry: unknown sale", method: "POST", path: "/api/evidence/manual", json: { transactionId: U, trackingNumber: "EE123456785IN", carrier: "India Post" }, expect: [404] },
  { name: "confirm field: empty body", method: "PATCH", path: `/api/evidence/${U}/fields`, json: {}, expect: [400] },
  { name: "confirm field: unknown evidence", method: "PATCH", path: `/api/evidence/${U}/fields`, json: { field: "tracking_number", value: "EE123456785IN" }, expect: [404] },
  { name: "confirm field: not a uuid", method: "PATCH", path: "/api/evidence/nope/fields", json: { field: "tracking_number" }, expect: [404] },
  { name: "evidence file: unknown id", method: "GET", path: `/api/evidence/${U}/file`, expect: [404] },
  { name: "create order: bad amount", method: "POST", path: "/api/paypal/orders", json: { amount: "abc" }, expect: [400] },
  { name: "create order: wrong currency", method: "POST", path: "/api/paypal/orders", json: { amount: "1.00", currency: "EUR" }, expect: [400] },
  { name: "capture: malformed order id", method: "POST", path: "/api/paypal/orders/x/capture", expect: [404] },
  { name: "approve: unknown action", method: "POST", path: `/api/actions/${U}/approve`, expect: [404] },
  { name: "approve: not a uuid", method: "POST", path: "/api/actions/nope/approve", expect: [404] },
  { name: "reject: unknown action", method: "POST", path: `/api/actions/${U}/reject`, expect: [404] },
  { name: "dispute: malformed id", method: "GET", path: "/api/disputes/!!!", expect: [404] },
  { name: "dispute: id PayPal does not know", method: "GET", path: "/api/disputes/PP-R-DOES-NOT-EXIST-1", expect: [404] },
  { name: "draft: bad action", method: "POST", path: "/api/disputes/PP-R-DOES-NOT-EXIST-1/draft", json: { action: "bogus" }, expect: [400] },
  { name: "draft: unknown dispute", method: "POST", path: "/api/disputes/PP-R-DOES-NOT-EXIST-1/draft", json: { action: "generate" }, expect: [404] },
  { name: "queue evidence: empty body", method: "POST", path: "/api/disputes/PP-R-DOES-NOT-EXIST-1/actions", json: {}, expect: [400] },
  { name: "queue evidence: draft far too long", method: "POST", path: "/api/disputes/PP-R-DOES-NOT-EXIST-1/actions", json: { draft: "x".repeat(7000) }, expect: [400] },
  { name: "sandbox helper: bad action", method: "POST", path: "/api/disputes/PP-R-DOES-NOT-EXIST-1/sandbox", json: { action: "nope" }, expect: [400] },
  { name: "limitation event: bad event", method: "POST", path: "/api/limitation/events", json: { event: "nope" }, expect: [400] },
  { name: "cover note: bad action", method: "POST", path: "/api/limitation/note", json: { action: "nope" }, expect: [400] },
  { name: "cover note: note too long", method: "POST", path: "/api/limitation/note", json: { action: "check", note: "x".repeat(5000) }, expect: [400] },
  { name: "cross-site POST (foreign Origin)", method: "POST", path: "/api/limitation/events", json: { event: "export_print" }, expect: [403] },
  { name: "POST with no Origin", method: "POST", path: "/api/limitation/events", json: { event: "export_print" }, expect: [403], noOrigin: true },
  { name: "webhook: nothing sent", method: "POST", path: "/api/webhooks/paypal", json: {}, expect: [400, 401, 503], noOrigin: true },
];

test.describe("8. API robustness", () => {
  for (const c of cases) {
    test(c.name, async ({ request, baseURL }) => {
      const headers: Record<string, string> = {};
      if (!c.noOrigin) headers.Origin = c.name.startsWith("cross-site") ? "https://evil.example" : baseURL!;
      const res = await request.fetch(c.path, {
        timeout: 60_000, // the first hit of a route in dev mode includes compiling it
        method: c.method,
        headers,
        ...(c.json !== undefined ? { data: c.json } : {}),
        ...(c.raw !== undefined ? { data: c.raw, headers: { ...headers, "Content-Type": "application/json" } } : {}),
        ...(c.multipart ? { multipart: c.multipart } : {}),
      });
      const text = await res.text();
      expect(c.expect, `${c.method} ${c.path} -> ${res.status()}: ${text.slice(0, 200)}`).toContain(res.status());
      expect(res.status(), "never a bare 500").not.toBe(500);
      expect(res.headers()["content-type"] ?? "").toMatch(/json/);
      const body = JSON.parse(text) as { error?: { message?: string; code?: string } };
      expect(typeof body.error?.message, `error.message in ${text.slice(0, 200)}`).toBe("string");
      expect(body.error!.message!.length).toBeGreaterThan(2);
      expect(typeof body.error?.code).toBe("string");
      // No stack trace, SQL, file path or secret in what a browser may see.
      expect(text).not.toMatch(/at \w[\w.]* \(|node_modules|select .* from|insert into|ANTHROPIC|sk-ant|postgres(ql)?:\/\//i);
    });
  }
});
