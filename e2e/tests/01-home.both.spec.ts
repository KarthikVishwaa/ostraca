import { expect, horizontalOverflow, settle, test } from "../fixtures";

// Test 1: the explainer home page.
test.describe("1. Home page", () => {
  test("loads, the roadmap is there, scrolling to the end works, and the buttons go to /ledger and /store", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Prove it before they ask" })).toBeVisible();
    const roadmap = page.getByRole("heading", { name: /Follow one sale: Priya/ });
    await expect(roadmap).toBeVisible();
    await expect(page.locator("[data-station]")).toHaveCount(6);

    // Scroll like a person: down the whole page in steps, then check the last station and the closing section.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 500) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(60);
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.getByRole("heading", { name: "Have your proof ready before anyone asks" })).toBeVisible();
    await expect(page.getByText("What you get")).toBeVisible();

    // The step bar followed the scroll: the last station's heading is visible and shows as step 6.
    await page.locator("[data-station]").nth(5).scrollIntoViewIfNeeded();
    await expect(page.getByText(/Step 6 of 6/)).toBeVisible();
    expect(await horizontalOverflow(page), "no horizontal scroll").toBeLessThanOrEqual(0);

    // Hero buttons.
    await page.goto("/");
    await page.getByRole("link", { name: "Open the ledger" }).first().click();
    await expect(page).toHaveURL(/\/ledger$/);
    await page.goto("/");
    await page.getByRole("link", { name: "Make a test sale" }).first().click();
    await expect(page).toHaveURL(/\/store$/);
  });

  test("the step bar jumps to a station", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await page.getByRole("button", { name: /Go to step 3/ }).click();
    await expect(page.getByRole("heading", { name: /Code verifies it/ })).toBeInViewport();
  });

  test("the verification demo reaches its final state (rejected then verified)", async ({ page }) => {
    await page.goto("/");
    await page.locator("[data-station]").nth(2).scrollIntoViewIfNeeded();
    // After the demo has played, the typed text is the corrected number and Verified shows.
    await expect(page.locator('[data-d="typed"]')).toHaveText("EE123456785IN", { timeout: 30_000 });
    await expect(page.locator('[data-station]').nth(2).getByText("Verified")).toBeVisible();
  });
});
