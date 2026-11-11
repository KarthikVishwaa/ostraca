import { expect, horizontalOverflow, settle, test } from "../fixtures";
import { readState } from "../state";

// Test 3: the ledger, on desktop (grid) and mobile (cards), and no sideways scrolling on any page.
test.describe("3. Ledger", () => {
  test("shows the test sale, opens it, grid on desktop and cards on mobile", async ({ page, isMobile }) => {
    const s = readState();
    await page.goto("/ledger");
    await expect(page.getByRole("heading", { level: 1, name: "Proof ledger" })).toBeVisible();

    if (isMobile) {
      const cards = page.getByRole("list", { name: "Sales" });
      await expect(cards).toBeVisible();
      await expect(page.locator(".ag-root")).toHaveCount(0); // the grid is replaced by cards below md
      const card = cards.getByRole("link", { name: new RegExp(s.main.item) });
      await expect(card).toContainText("E2E Test Buyer");
      await expect(card).toContainText("120.00 USD");
      await card.tap();
    } else {
      await expect(page.locator(".ag-root")).toBeVisible();
      const row = page.locator(".ag-row", { hasText: s.main.captureId });
      await expect(row).toBeVisible();
      await expect(row).toContainText("E2E Test Buyer");
      await expect(row).toContainText(s.main.item);
      await row.getByRole("link", { name: s.main.item }).click();
    }
    await expect(page).toHaveURL(new RegExp(`/sales/${s.main.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: s.main.item })).toBeVisible();
  });

  test("the sale with no buyer and no city renders without errors", async ({ page, isMobile }) => {
    const s = readState();
    await page.goto("/ledger");
    if (isMobile) await expect(page.getByRole("list", { name: "Sales" }).getByRole("link", { name: /E2E Sparse Sale/ })).toContainText("Unknown buyer");
    else await expect(page.locator(".ag-row", { hasText: s.sparse.captureId })).toBeVisible();
  });

  test("no horizontal scroll on any page", async ({ page }) => {
    const s = readState();
    const pages = ["/", "/ledger", "/store", "/disputes", "/limitation", "/limitation/pack", `/sales/${s.main.id}`, `/sales/${s.sparse.id}`];
    for (const p of pages) {
      await page.goto(p);
      await settle(page, 1500);
      expect(await horizontalOverflow(page), `horizontal scroll on ${p}`).toBeLessThanOrEqual(0);
    }
  });
});
