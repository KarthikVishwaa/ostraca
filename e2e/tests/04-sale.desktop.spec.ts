import type { Page } from "@playwright/test";
import { allowApi, expect, test } from "../fixtures";
import { readState } from "../state";

// Test 4: the sale page, typing like a seller: a typo is rejected, the fix verifies, re-entering is recognised,
// a sale with missing data shows a note not an error, and PayPal's real refusal of a fake capture is shown.

const score = async (page: Page) => Number((await page.getByRole("img", { name: /Readiness score/ }).getAttribute("aria-label"))!.match(/score (\d+)/)![1]);
const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]", { hasText: text });

async function typeIn(page: Page, tracking: string, city: string) {
  await page.getByRole("tab", { name: "Type it in" }).click();
  await page.getByLabel("Tracking number").fill(tracking);
  await page.getByLabel("Carrier").fill("India Post");
  await page.getByLabel("Destination city (optional)").fill(city);
  await page.getByRole("button", { name: "Save and check" }).click();
}

test.describe.serial("4. Sale page", () => {
  test("typo is rejected and nothing is queued; the fix verifies, the score rises, Ready to file appears; re-entering says Already in your proof record", async ({ page, request }) => {
    const s = readState();
    await page.goto(`/sales/${s.main.id}`);
    await expect(page.getByRole("heading", { level: 1, name: s.main.item })).toBeVisible();
    await expect(page.getByRole("img", { name: /Readiness score/ })).toBeVisible();
    const before = await score(page);

    // The typo: S10 check digit is wrong (EE123456789IN).
    await typeIn(page, "EE123456789IN", s.main.city);
    await expect(toast(page, /flagged/i)).toBeVisible();
    await expect(page.getByText("rejected", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/check digit should be 5/i).first()).toBeVisible();
    await expect(page.getByText("Ready to file with PayPal")).toHaveCount(0);
    const afterTypo = await request.get(`/api/transactions/${s.main.id}`).then((r) => r.json());
    expect(afterTypo.actions, "a rejected number must not queue a PayPal request").toHaveLength(0);

    // The fix.
    await typeIn(page, "EE123456785IN", s.main.city);
    await expect(toast(page, /Saved and checked/i)).toBeVisible();
    await expect(page.getByText("verified", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Ready to file with PayPal")).toBeVisible();
    await expect.poll(() => score(page)).toBeGreaterThan(before);

    // The same data again is recognised.
    await typeIn(page, "EE123456785IN", s.main.city);
    await expect(toast(page, /Already in your proof record/i)).toBeVisible();
  });

  test("approving on a fake capture shows PayPal's real refusal and the page stays usable", async ({ page }) => {
    const s = readState();
    allowApi(page, [{ url: /\/api\/actions\/[^/]+\/approve/, status: [400, 404, 409, 422, 429, 502] }]);
    await page.goto(`/sales/${s.main.id}`);
    await expect(page.getByText("Ready to file with PayPal")).toBeVisible();
    await page.getByRole("button", { name: "Approve and file tracking" }).click();

    // A real stage bar ran, then PayPal's own error (the capture does not exist in PayPal) is shown.
    const err = page.getByTestId("task-error");
    await expect(err).toBeVisible({ timeout: 60_000 });
    await expect(err).toContainText(/PayPal|not found|RESOURCE|INVALID|NOT_AUTHORIZED|UNPROCESSABLE|request/i);
    await expect(toast(page, /Approval failed/i)).toBeVisible();
    // The page is still usable: the failed attempt is recorded and the approve button comes back as a retry.
    await page.reload();
    await expect(page.getByText(/Last attempt failed/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve and retry" })).toBeEnabled();
    await expect(page.getByRole("heading", { level: 1, name: s.main.item })).toBeVisible();
  });

  test("a sale with no buyer and no city shows a needs-review note, not an error", async ({ page }) => {
    const s = readState();
    await page.goto(`/sales/${s.sparse.id}`);
    await expect(page.getByRole("heading", { level: 1, name: s.sparse.item })).toBeVisible();
    await expect(page.getByText(/Unknown buyer/)).toBeVisible();
    await expect(page.getByText(/no ship-to city from PayPal/)).toBeVisible();
    await typeIn(page, "EE123456785IN", "Mumbai");
    // The city cannot be compared (PayPal sent none), so the check says so in a note. It is not an error: the value
    // the seller typed is kept and counts as "confirmed by you" because the seller vouches for it.
    await expect(page.getByText(/no shipping city to compare against/i).first()).toBeVisible();
    await expect(page.getByText("confirmed by you").first()).toBeVisible();
    await expect(page.getByText("rejected", { exact: true })).toHaveCount(0);
    await expect(toast(page, /error|failed/i)).toHaveCount(0);
  });
});
