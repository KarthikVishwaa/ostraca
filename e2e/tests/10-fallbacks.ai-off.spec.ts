import { disputeId, readPercentages, runDisputeJourney, watchPercentages } from "../dispute-flow";
import { expect, test, uniquePng } from "../fixtures";
import { readState } from "../state";

// Test 10: with the AI keys REMOVED (this project's server runs without ANTHROPIC_API_KEY and OPENAI_API_KEY),
// every AI feature falls back to the plain template, says so in words, and never errors. No AI call is made.
test.describe("10. Fallbacks without AI", () => {
  test("the server really has no AI key", async ({ request }) => {
    const h = await (await request.get("/api/health")).json();
    expect(h.claude, "this server must run without the AI key").toBe("problem");
  });

  test("dispute draft: template, explained, same citation checks; the whole journey still works", async ({ page, request }) => {
    const id = await disputeId(request);
    await runDisputeJourney(page, id, { button: /Draft a plain template|Draft response with AI|Draft again/, expectRealAi: false });
    await expect(page.getByText(/plain template/i).first()).toBeVisible();
  });

  test("dispute draft via the API is a 200 with the template and an explanation, never a 500", async ({ request }) => {
    const id = await disputeId(request);
    const res = await request.post(`/api/disputes/${id}/draft`, { data: { action: "generate" }, headers: { Origin: "http://localhost:3100" } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("template");
    expect(body.notice).toMatch(/plain template/i);
    expect(body.check.ok).toBe(true);
  });

  test("cover note: template, explained, and the progress bar still runs", async ({ page }) => {
    await page.goto("/limitation");
    await expect(page.getByRole("region", { name: /Sales and their proof/ })).toBeVisible({ timeout: 45_000 });
    await watchPercentages(page);
    await page.getByRole("button", { name: /Write a plain template|Write a cover note with AI|Write it again/ }).click();
    await expect(page.getByTestId("task-progress")).toHaveAttribute("data-status", "done", { timeout: 60_000 });
    const { pcts } = await readPercentages(page);
    expect(pcts[pcts.length - 1]).toBe(100);
    await expect(page.getByText(/AI is not set up|plain template/i).first()).toBeVisible();
    await expect(page.getByText(/Checks passed/)).toBeVisible();
  });

  test("an AI-mode upload without a key still saves the file and explains why there are no suggestions", async ({ request }) => {
    const s = readState();
    const res = await request.post("/api/evidence", {
      headers: { Origin: "http://localhost:3100" },
      multipart: { transactionId: s.sparse.id, mode: "ai", file: { name: "noai.png", mimeType: "image/png", buffer: uniquePng() } },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.aiError).toMatch(/not set up/i);
    expect(body.evidenceId).toBeTruthy();
  });
});
