import { expect, test } from "../fixtures";

// Test 9: a webhook that PayPal did not sign must be refused.
test.describe("9. Forged webhook", () => {
  test("a dispute event without a valid PayPal signature is rejected and changes nothing", async ({ request }) => {
    const forged = { id: `WH-FORGED-${Date.now()}`, event_type: "CUSTOMER.DISPUTE.CREATED", resource: { dispute_id: "PP-R-FORGED-0001" } };
    const res = await request.post("/api/webhooks/paypal", {
      data: forged,
      headers: {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-FAKE",
        "paypal-transmission-id": "00000000-0000-4000-8000-000000000001",
        "paypal-transmission-sig": "bm90IGEgcmVhbCBzaWduYXR1cmU=",
        "paypal-transmission-time": new Date().toISOString(),
      },
    });
    // 401 when a webhook ID is configured (PayPal says the signature is not valid); 503 when none is configured at all.
    expect([401, 503], `got ${res.status()}`).toContain(res.status());
    const body = await res.json();
    expect(body.error.message).toMatch(/signature|webhook/i);
    // It did not create a dispute for the forged ID.
    const list = await (await request.get("/api/disputes")).json();
    expect((list as Array<{ id: string }>).some((d) => d.id === "PP-R-FORGED-0001")).toBe(false);
  });

  test("a body that is not JSON is refused too", async ({ request }) => {
    const res = await request.post("/api/webhooks/paypal", { data: "{{{ not json", headers: { "Content-Type": "application/json" } });
    expect([400, 401, 503]).toContain(res.status());
    expect(res.status()).not.toBe(500);
  });
});
