import { expect, test } from "@playwright/test";
import { CARRIER_NAME_OTHER_MAX, DISPUTE_CARRIERS, EVIDENCE_NOTES_MAX, EVIDENCE_TYPES, TRACKING_NUMBER_MAX } from "../../src/lib/paypal/dispute-enums";
import { buildEvidencePayload, toDisputeCarrier, type EvidenceItem } from "../../src/lib/paypal/evidence-payload";

// Test 12: the provide-evidence payload against PayPal's own schema, and the request shape with the network mocked.
// Nothing here can reach PayPal: the builder is pure and fetch is replaced before any request is made.

const NOTES = "PayPal captured a payment of 120.00 USD on 2026-11-11, capture 45X48934EU968890T. The shipment has tracking number EE123456785IN with India Post.";
const TRACKING = { trackingNumber: "EE123456785IN", carrierName: "India Post" };
const INR = "MERCHANDISE_OR_SERVICE_NOT_RECEIVED";

/** The rules of PayPal's Customer Disputes v1 `evidence` and `tracking_info` schemas. */
function assertValidAgainstPayPalSchema(evidences: EvidenceItem[]) {
  expect(evidences.length).toBeGreaterThanOrEqual(1);
  for (const ev of evidences) {
    expect(Object.keys(ev).every((k) => ["evidence_type", "evidence_info", "notes", "documents", "item_id"].includes(k)), `unknown key in ${Object.keys(ev)}`).toBe(true);
    expect(ev.evidence_type).toMatch(/^[0-9A-Z_]+$/);
    expect(EVIDENCE_TYPES).toContain(ev.evidence_type);
    if (ev.notes !== undefined) {
      expect(ev.notes.length).toBeGreaterThanOrEqual(1);
      expect(ev.notes.length).toBeLessThanOrEqual(EVIDENCE_NOTES_MAX);
    }
    if (ev.evidence_type === "PROOF_OF_FULFILLMENT") expect(ev.evidence_info?.tracking_info, "evidence_info is expected for PROOF_OF_FULFILLMENT").toBeDefined();
    const list = ev.evidence_info?.tracking_info;
    if (list) {
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.length).toBeLessThanOrEqual(10);
      for (const t of list) {
        expect(Object.keys(t).every((k) => ["carrier_name", "carrier_name_other", "tracking_url", "tracking_number"].includes(k))).toBe(true);
        expect(t.carrier_name).toMatch(/^[0-9A-Z_]+$/);
        expect(DISPUTE_CARRIERS, `carrier ${t.carrier_name} is in PayPal's list`).toContain(t.carrier_name);
        if (t.carrier_name === "OTHER") {
          expect(t.carrier_name_other, "carrier_name_other is mandatory for OTHER").toBeTruthy();
          expect(t.carrier_name_other!.length).toBeLessThanOrEqual(CARRIER_NAME_OTHER_MAX);
        }
        expect(t.tracking_number.length).toBeGreaterThanOrEqual(1);
        expect(t.tracking_number.length).toBeLessThanOrEqual(TRACKING_NUMBER_MAX);
      }
    }
  }
}

test.describe("12. Evidence payload", () => {
  for (const stage of ["INQUIRY", "CHARGEBACK"]) {
    test(`item-not-received at ${stage}: proof of fulfillment with tracking_info and the cited text in notes`, () => {
      const r = buildEvidencePayload({ reason: INR, stage, requested: ["PROOF_OF_FULFILLMENT"], notes: NOTES, tracking: TRACKING });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      assertValidAgainstPayPalSchema(r.evidences);
      expect(r.evidences).toEqual([
        { evidence_type: "PROOF_OF_FULFILLMENT", evidence_info: { tracking_info: [{ carrier_name: "INDIA_POST", tracking_number: "EE123456785IN" }] }, notes: NOTES },
      ]);
    });
  }

  test("at CHARGEBACK PayPal may ask for more types: only the one we can honestly support is sent", () => {
    const r = buildEvidencePayload({ reason: INR, stage: "CHARGEBACK", requested: ["PROOF_OF_FULFILLMENT", "PROOF_OF_DELIVERY_SIGNATURE", "ADDITIONAL_PROOF_OF_SHIPMENT"], notes: NOTES, tracking: TRACKING });
    expect(r.ok && r.evidences.map((e) => e.evidence_type)).toEqual(["PROOF_OF_FULFILLMENT"]);
  });

  test("when PayPal does not say what it requested, item-not-received still defaults to proof of fulfillment", () => {
    const r = buildEvidencePayload({ reason: INR, stage: "INQUIRY", notes: NOTES, tracking: TRACKING });
    expect(r.ok).toBe(true);
  });

  test("a carrier that is not in PayPal's list is sent as OTHER with carrier_name_other", () => {
    const r = buildEvidencePayload({ reason: INR, requested: ["PROOF_OF_FULFILLMENT"], notes: NOTES, tracking: { trackingNumber: "AB123", carrierName: "Speedy Couriers (Coimbatore)" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    assertValidAgainstPayPalSchema(r.evidences);
    expect(r.evidences[0].evidence_info!.tracking_info[0]).toEqual({ carrier_name: "OTHER", carrier_name_other: "Speedy Couriers (Coimbatore)", tracking_number: "AB123" });
  });

  test("carrier names map to PayPal's list: spaces and case are normalised, unknown names become OTHER", () => {
    expect(toDisputeCarrier("India Post")).toEqual({ carrier_name: "INDIA_POST" });
    expect(toDisputeCarrier("dhl")).toEqual({ carrier_name: "DHL" });
    expect(toDisputeCarrier("FedEx")).toEqual({ carrier_name: "FEDEX" });
    expect(toDisputeCarrier("OTHER")).toEqual({ carrier_name: "OTHER", carrier_name_other: "OTHER" });
    expect(toDisputeCarrier("Some Local Courier").carrier_name).toBe("OTHER");
  });

  test("the failing case: no confirmed carrier used to drop the tracking and send OTHER, which PayPal refuses; it must never be OTHER now", () => {
    const withGuess = buildEvidencePayload({ reason: INR, stage: "INQUIRY", requested: ["PROOF_OF_FULFILLMENT"], notes: NOTES, tracking: { trackingNumber: "EE123456785IN", carrierName: "India Post" } });
    expect(withGuess.ok && withGuess.evidences[0].evidence_type).toBe("PROOF_OF_FULFILLMENT");
    const noCarrier = buildEvidencePayload({ reason: INR, requested: ["PROOF_OF_FULFILLMENT"], notes: NOTES, tracking: { trackingNumber: "EE123456785IN", carrierName: null } });
    expect(noCarrier.ok).toBe(false); // refused with a clear message, not sent as OTHER
    expect(JSON.stringify(noCarrier)).not.toContain('"OTHER"');
  });

  test("refuses, with a plain reason, instead of sending something PayPal will reject", () => {
    const refused = (i: Parameters<typeof buildEvidencePayload>[0]) => {
      const r = buildEvidencePayload(i);
      expect(r.ok).toBe(false);
      return r.ok ? "" : r.reason;
    };
    expect(refused({ reason: INR, requested: ["PROOF_OF_FULFILLMENT"], notes: NOTES, tracking: null })).toMatch(/tracking number/);
    expect(refused({ reason: INR, requested: ["PROOF_OF_FULFILLMENT"], notes: NOTES, tracking: { trackingNumber: "", carrierName: "DHL" } })).toMatch(/tracking number/);
    expect(refused({ reason: INR, requested: ["PROOF_OF_REFUND"], notes: NOTES, tracking: TRACKING })).toMatch(/PROOF_OF_REFUND/);
    expect(refused({ reason: "UNAUTHORISED", notes: NOTES, tracking: TRACKING })).toMatch(/Ostraca can only send proof of fulfillment/);
    expect(refused({ reason: INR, requested: ["PROOF_OF_FULFILLMENT"], notes: "   ", tracking: TRACKING })).toMatch(/no text/);
    expect(refused({ reason: INR, requested: ["PROOF_OF_FULFILLMENT"], notes: "x".repeat(EVIDENCE_NOTES_MAX + 1), tracking: TRACKING })).toMatch(/2000/);
  });

  test("a request type PayPal does not know is ignored, never forwarded", () => {
    const r = buildEvidencePayload({ reason: INR, requested: ["NOT_A_REAL_TYPE", "PROOF_OF_FULFILLMENT"], notes: NOTES, tracking: TRACKING });
    expect(r.ok && r.evidences[0].evidence_type).toBe("PROOF_OF_FULFILLMENT");
  });
});

// ---- the request itself, with the network mocked --------------------------------------------------------------------

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

async function withMockedPayPal<T>(provideEvidenceAnswer: { status: number; body: unknown }, run: (calls: Call[]) => Promise<T>) {
  const calls: Call[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (new URL(url).host !== "api-m.sandbox.paypal.com") throw new Error(`blocked: the test tried to reach ${url}`); // nothing else may be called
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    calls.push({ url, method: init?.method ?? "GET", headers, body: init?.body });
    if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "TEST-TOKEN", expires_in: 3000 }), { status: 200, headers: { "content-type": "application/json" } });
    if (/\/v1\/customer\/disputes\/[^/]+\/provide-evidence$/.test(url)) return new Response(JSON.stringify(provideEvidenceAnswer.body), { status: provideEvidenceAnswer.status, headers: { "content-type": "application/json" } });
    throw new Error(`blocked: unexpected PayPal call ${init?.method ?? "GET"} ${url}`);
  }) as typeof fetch;
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function loadServerModules() {
  // The app's server-only guard throws outside Next; stub it for this test process, and give the env loader dummy values.
  const resolved = require.resolve("server-only");
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: {} } as unknown as NodeJS.Module;
  // Resolve the app's "@/" alias for this process (Playwright's loader does not for modules loaded this way).
  const Module = require("node:module") as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
  const original = Module._resolveFilename;
  if (!(original as { patched?: boolean }).patched) {
    const patched = (request: string, ...rest: unknown[]) => original.call(Module, request.startsWith("@/") ? require("node:path").join(process.cwd(), "src", request.slice(2)) : request, ...rest);
    (patched as unknown as { patched: boolean }).patched = true;
    Module._resolveFilename = patched;
  }
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://u:p@localhost:5432/none",
    PAYPAL_CLIENT_ID: "TEST-CLIENT-ID-0000",
    PAYPAL_CLIENT_SECRET: "TEST-CLIENT-SECRET-0000",
    PAYPAL_API_BASE: "https://api-m.sandbox.paypal.com",
    BETTER_AUTH_SECRET: undefined,
  });
  const { provideEvidence } = await import("../../src/lib/paypal/disputes");
  const { PayPalError } = await import("../../src/lib/paypal/client");
  const { toErrorInfo } = await import("../../src/lib/api");
  return { provideEvidence, PayPalError, toErrorInfo };
}

test.describe("12b. provide-evidence request (network mocked)", () => {
  test("sends one multipart POST to the dispute's provide-evidence URL, with an idempotency key and only the `input` JSON part", async () => {
    const { provideEvidence } = await loadServerModules();
    const built = buildEvidencePayload({ reason: INR, stage: "INQUIRY", requested: ["PROOF_OF_FULFILLMENT"], notes: NOTES, tracking: TRACKING });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    await withMockedPayPal({ status: 200, body: {} }, async (calls) => {
      await provideEvidence({ disputeId: "PP-R-XDH-10199113", evidences: built.evidences, idempotencyKey: "evidence-PP-R-XDH-10199113-abc123" });
      const writes = calls.filter((c) => c.method === "POST" && c.url.includes("/provide-evidence"));
      expect(writes, "exactly one write").toHaveLength(1);
      const w = writes[0];
      expect(w.url).toBe("https://api-m.sandbox.paypal.com/v1/customer/disputes/PP-R-XDH-10199113/provide-evidence");
      expect(w.headers["authorization"]).toBe("Bearer TEST-TOKEN");
      expect(w.headers["paypal-request-id"]).toBe("evidence-PP-R-XDH-10199113-abc123");
      const form = w.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect([...form.keys()], "no file parts").toEqual(["input"]);
      const part = form.get("input") as Blob;
      expect(part.type).toBe("application/json");
      const sent = JSON.parse(await part.text()) as { evidences: EvidenceItem[] };
      expect(Object.keys(sent)).toEqual(["evidences"]);
      assertValidAgainstPayPalSchema(sent.evidences);
      expect(sent.evidences[0].evidence_type).toBe("PROOF_OF_FULFILLMENT");
      expect(sent.evidences[0].evidence_info!.tracking_info).toEqual([{ carrier_name: "INDIA_POST", tracking_number: "EE123456785IN" }]);
      expect(sent.evidences[0].notes).toBe(NOTES);
    });
  });

  test("PayPal's error details (field, issue, description) reach the user, with the debug id and no stack", async () => {
    const { provideEvidence, PayPalError, toErrorInfo } = await loadServerModules();
    const body = {
      name: "INVALID_REQUEST",
      message: "Request is not well-formed, syntactically incorrect, or violates schema.",
      debug_id: "ca58f78cd5d51",
      details: [{ field: "/evidences/0/evidence_type", issue: "EVIDENCE_TYPE_IS_NOT_ALLOWED", description: "The evidence type OTHER is not allowed for this dispute." }],
    };
    await withMockedPayPal({ status: 400, body }, async () => {
      const err = await provideEvidence({ disputeId: "PP-R-XDH-10199113", evidences: [{ evidence_type: "OTHER", notes: "x" }], idempotencyKey: "k" }).then(
        () => null,
        (e) => e
      );
      expect(err).toBeInstanceOf(PayPalError);
      const info = toErrorInfo(err);
      expect(info.status).toBe(400);
      expect(info.debugId).toBe("ca58f78cd5d51");
      expect(info.message).toContain("EVIDENCE_TYPE_IS_NOT_ALLOWED");
      expect((info.extra as { problems: string[] }).problems).toEqual(["/evidences/0/evidence_type: EVIDENCE_TYPE_IS_NOT_ALLOWED - The evidence type OTHER is not allowed for this dispute."]);
      expect(JSON.stringify(info)).not.toMatch(/at \w+ \(|node_modules/);
    });
  });

  test("the mock refuses any other host, so a test can never reach a real PayPal account", async () => {
    await withMockedPayPal({ status: 200, body: {} }, async () => {
      await expect(fetch("https://api-m.paypal.com/v1/customer/disputes/X/provide-evidence", { method: "POST" })).rejects.toThrow(/blocked/);
    });
  });
});
