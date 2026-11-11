import fs from "node:fs";
import { expect, test } from "../fixtures";
import { readState } from "../state";
import { watchPercentages, readPercentages } from "../dispute-flow";

// Test 7: the limitation pack: simulate the notice, the table, the cover note (one real AI call), print page and HTML download.
const SKIP_AI = process.env.E2E_SKIP_AI === "1";
const toast = (page: import("@playwright/test").Page, text: string | RegExp) => page.locator("[data-sonner-toast]", { hasText: text });

test.describe("7. Limitation pack", () => {
  test("simulate the notice and see the table, including rows not yet in PayPal's report", async ({ page }) => {
    const s = readState();
    await page.goto("/limitation");
    await expect(page.getByRole("note")).toContainText("SIMULATED");
    await expect(page.getByRole("heading", { level: 1, name: "Limitation pack" })).toBeVisible();
    await page.getByRole("button", { name: "Simulate limitation notice" }).click();
    await expect(toast(page, /Recorded\. This is a simulation/)).toBeVisible();
    await expect(page.getByText("Your account has a temporary limitation")).toBeVisible();

    const table = page.getByRole("region", { name: /Sales and their proof/ }).locator("table");
    await expect(table).toBeVisible({ timeout: 45_000 });
    const mine = table.locator("tr", { hasText: "E2E Test Buyer" });
    await expect(mine).toBeVisible();
    await expect(mine).toContainText("120.00 USD");
    await expect(mine).toContainText("Not in PayPal's report yet"); // sandbox reports lag; our own record is labelled as such
    await expect(page.getByText(/Where this list comes from/)).toBeVisible();
    void s;
  });

  test("the cover note shows a progress bar and a checked note", async ({ page }) => {
    test.skip(SKIP_AI, "E2E_SKIP_AI=1: the template version runs on the AI-off server (test 10)");
    await page.goto("/limitation");
    await expect(page.getByRole("region", { name: /Sales and their proof/ })).toBeVisible({ timeout: 45_000 });
    await watchPercentages(page);
    const button = page.getByRole("button", { name: /Write a cover note with AI|Write it again/ });
    await button.click();
    await expect(button).toBeDisabled(); // no double submission
    await expect(page.getByTestId("task-progress")).toHaveAttribute("data-status", "done", { timeout: 120_000 });
    const { pcts, labels } = await readPercentages(page);
    expect(pcts.length, `percentages: ${pcts.join(", ")}`).toBeGreaterThanOrEqual(3);
    expect([...pcts].sort((a, b) => a - b)).toEqual(pcts);
    expect(pcts[pcts.length - 1]).toBe(100);
    expect(labels.join(" | ")).toMatch(/Writing the cover note/);
    await expect(page.getByRole("textbox", { name: "Cover note" })).not.toHaveValue("");
    await expect(page.getByText(/Checks passed|AI could not write this/).first()).toBeVisible();
  });

  test("the print page and the HTML download both carry the SIMULATED banner", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => void ((window as unknown as { __printed: number }).__printed++);
    });
    await page.goto("/limitation");
    await page.getByRole("link", { name: "Open print-friendly pack" }).click();
    await expect(page).toHaveURL(/\/limitation\/pack$/);
    const pack = page.locator("#pack");
    await expect(pack).toBeVisible({ timeout: 45_000 });
    await expect(pack).toContainText("SIMULATED");
    await expect(pack.getByRole("table").first()).toBeVisible();

    await page.getByRole("button", { name: /Print or save as PDF/ }).click();
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download HTML file" }).click()]);
    expect(download.suggestedFilename()).toMatch(/ostraca-limitation-pack-.*SIMULATED\.html$/);
    const file = await download.path();
    const html = fs.readFileSync(file!, "utf8");
    expect(html).toContain("SIMULATED");
    expect(html).toContain("id=\"pack\"");
    expect(html, "no script in the downloaded file").not.toMatch(/<script/i);
  });
});
