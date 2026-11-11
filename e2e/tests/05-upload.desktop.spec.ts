import type { Page } from "@playwright/test";
import { allowApi, expect, test, uniquePng } from "../fixtures";
import { readState } from "../state";

// Test 5: uploading evidence. A valid PNG shows a real progress bar that finishes; a huge file and a renamed .exe are
// refused with a clear message.

const SKIP_AI = process.env.E2E_SKIP_AI === "1";

async function watchPercentages(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __pcts: number[] };
    w.__pcts = [];
    new MutationObserver(() => {
      const e = document.querySelector('[data-testid="task-pct"]');
      const v = e ? parseInt(e.textContent ?? "", 10) : NaN;
      if (!Number.isNaN(v) && w.__pcts[w.__pcts.length - 1] !== v) w.__pcts.push(v);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}
const percentages = (page: Page) => page.evaluate(() => (window as unknown as { __pcts: number[] }).__pcts);

async function pick(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.getByRole("tab", { name: "Upload a file" }).click();
  await page.locator("#evidence-file").setInputFiles({ name, mimeType, buffer });
}

test.describe("5. Evidence upload", () => {
  test("a valid PNG shows a progress bar with a percentage that finishes", async ({ page }) => {
    const s = readState();
    await page.goto(`/sales/${s.sparse.id}`);
    await watchPercentages(page);
    await pick(page, "receipt.png", "image/png", uniquePng());
    if (SKIP_AI) await page.getByLabel(/Manual entry/).check();
    await page.getByRole("button", { name: /Upload and read|Save file/ }).click();

    const bar = page.getByTestId("task-progress");
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("data-status", "done", { timeout: 90_000 });
    await expect(page.getByTestId("task-pct")).toHaveText("100%");
    const seen = await percentages(page);
    expect(seen.length, `percentages seen: ${seen.join(", ")}`).toBeGreaterThanOrEqual(2);
    expect(seen[seen.length - 1]).toBe(100);
    expect([...seen].sort((a, b) => a - b), "the percentage never goes backwards").toEqual(seen);
    expect(seen.slice(0, -1).every((p) => p < 100), "100% only at the very end").toBe(true);
    // The evidence card for the file appears.
    await expect(page.getByText("receipt.png").first()).toBeVisible();
  });

  test("a file over 8 MB and a renamed .exe are refused with a clear message", async ({ page }) => {
    const s = readState();
    allowApi(page, [{ url: /\/api\/evidence$/, status: [413, 415] }]);
    await page.goto(`/sales/${s.sparse.id}`);

    const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(9 * 1024 * 1024)]);
    await pick(page, "huge.png", "image/png", big);
    await page.getByRole("button", { name: /Upload and read|Save file/ }).click();
    await expect(page.getByTestId("task-error")).toContainText(/too large/i, { timeout: 60_000 });
    await page.getByRole("button", { name: "Dismiss" }).click();

    await pick(page, "evil.png", "image/png", Buffer.from("MZ\x90\x00 this is a windows program, not a picture, padding padding padding"));
    await page.getByRole("button", { name: /Upload and read|Save file/ }).click();
    await expect(page.getByTestId("task-error")).toContainText(/Unsupported file|do not match/i, { timeout: 30_000 });
    // Still usable: the upload button is enabled again.
    await expect(page.getByRole("button", { name: /Upload and read|Save file/ })).toBeEnabled();
  });
});
