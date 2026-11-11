import { disputeId, runDisputeJourney } from "../dispute-flow";
import { expect, test } from "../fixtures";

// Test 6: disputes, with the REAL AI (one real draft call). The same journey runs on the AI-off server in test 10.
const SKIP_AI = process.env.E2E_SKIP_AI === "1";

test.describe("6. Disputes", () => {
  test("the list shows disputes read from PayPal", async ({ page, request }) => {
    await page.goto("/disputes");
    const id = await disputeId(request);
    await expect(page.getByRole("link", { name: new RegExp(id) })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/refresh every 10 seconds/)).toBeVisible();
  });

  test("draft with AI shows rising progress, a wrong tracking number blocks the queue, queue then approve ends cleanly", async ({ page, request }) => {
    test.skip(SKIP_AI, "E2E_SKIP_AI=1: the same journey runs with the template on the AI-off server (test 10)");
    const id = await disputeId(request);
    await runDisputeJourney(page, id, { button: /Draft response with AI|Draft again/, expectRealAi: true });
  });
});
