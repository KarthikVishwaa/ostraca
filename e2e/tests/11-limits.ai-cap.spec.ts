import { disputeId } from "../dispute-flow";
import { allowApi, expect, test, uniquePng } from "../fixtures";
import { readState } from "../state";

// Test 11 (part of 8): this server runs with AI_DAILY_CALL_CAP=0 and the real AI keys. The first AI request is
// refused by the daily cap BEFORE any model is called, so these tests spend nothing. Then the rate limiter.
const ORIGIN = "http://localhost:3200";

test.describe("11. AI daily cap and rate limits", () => {
  test("the daily cap answers 429 'AI is paused for today' with Retry-After, for draft, cover note and upload", async ({ request }) => {
    const id = await disputeId(request);
    const draft = await request.post(`/api/disputes/${id}/draft`, { data: { action: "generate" }, headers: { Origin: ORIGIN } });
    expect(draft.status()).toBe(429);
    expect(Number(draft.headers()["retry-after"])).toBeGreaterThan(0);
    const d = await draft.json();
    expect(d.error.code).toBe("ai_paused");
    expect(d.error.message).toMatch(/AI is paused for today/);

    const note = await request.post("/api/limitation/note", { data: { action: "generate" }, headers: { Origin: ORIGIN } });
    expect(note.status()).toBe(429);
    expect((await note.json()).error.code).toBe("ai_paused");

    const s = readState();
    const up = await request.post("/api/evidence", {
      headers: { Origin: ORIGIN },
      multipart: { transactionId: s.sparse.id, mode: "ai", file: { name: "cap.png", mimeType: "image/png", buffer: uniquePng() } },
    });
    expect(up.status()).toBe(429);
    expect((await up.json()).error.code).toBe("ai_paused");

    // The template path is free and still works when AI is paused.
    const tpl = await request.post(`/api/disputes/${id}/draft`, { data: { action: "generate", template: true }, headers: { Origin: ORIGIN } });
    expect(tpl.status()).toBe(200);
    expect((await tpl.json()).source).toBe("template");
  });

  test("the draft page falls back to the template by itself when AI is paused", async ({ page, request }) => {
    allowApi(page, [{ url: /\/draft$/, status: [429] }]);
    const id = await disputeId(request);
    await page.goto(`/disputes/${id}`);
    await page.getByRole("button", { name: /Draft response with AI|Draft again/ }).click();
    await expect(page.locator("[data-sonner-toast]", { hasText: /AI is paused for today/ })).toBeVisible();
    await expect(page.getByText(/plain template/i).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Checks passed/)).toBeVisible({ timeout: 30_000 });
  });

  test("the upload page switches to manual entry by itself when AI is paused", async ({ page }) => {
    allowApi(page, [{ url: /\/api\/evidence$/, status: [429] }]);
    const s = readState();
    await page.goto(`/sales/${s.sparse.id}`);
    await page.getByRole("tab", { name: "Upload a file" }).click();
    await page.locator("#evidence-file").setInputFiles({ name: "cap.png", mimeType: "image/png", buffer: uniquePng() });
    await page.getByRole("button", { name: "Upload and read" }).click();
    await expect(page.getByText(/AI is paused for today\. Manual entry is switched on/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel(/Manual entry/)).toBeChecked();
  });

  test("hammering a read route trips the rate limiter with 429, Retry-After and a friendly message (last: it blocks this server for a minute)", async ({ request }) => {
    const hits: number[] = [];
    let first429: { status: number; retry: string | undefined; body: { error: { code: string; message: string } } } | null = null;
    for (let batch = 0; batch < 8 && !first429; batch++) {
      const rs = await Promise.all(Array.from({ length: 50 }, () => request.get("/api/transactions")));
      for (const r of rs) {
        hits.push(r.status());
        if (r.status() === 429 && !first429) first429 = { status: 429, retry: r.headers()["retry-after"], body: await r.json() };
      }
    }
    expect(first429, `statuses seen: ${[...new Set(hits)].join(", ")}`).not.toBeNull();
    expect(Number(first429!.retry)).toBeGreaterThan(0);
    expect(first429!.body.error.code).toBe("rate_limited");
    expect(first429!.body.error.message).toMatch(/try again/i);
    expect(hits.every((s) => s === 200 || s === 429), "only 200 or 429, never a 500").toBe(true);
  });
});
