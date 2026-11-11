import { expect, settle, test } from "../fixtures";

// Test 2: navigation. Desktop: hover, click, keyboard and Escape on the dropdown tabs. Mobile: the menu sheet.
test.describe("2. Navigation", () => {
  test("desktop: header links, dropdown hover/click/keyboard/Escape", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop-only: the tabs are hidden below md");
    await page.goto("/");
    await settle(page);
    const nav = page.getByRole("navigation", { name: "Main" });

    // Direct link.
    await nav.getByRole("link", { name: "Proof ledger" }).click();
    await expect(page).toHaveURL(/\/ledger$/);

    // Hover opens, leaving closes (after a short delay).
    const product = nav.getByRole("button", { name: "Product" });
    await product.hover();
    await expect(page.getByRole("menu", { name: "Product" })).toBeVisible();
    await expect(product).toHaveAttribute("aria-expanded", "true");
    await page.mouse.move(700, 500);
    await expect(page.getByRole("menu", { name: "Product" })).toBeHidden();

    // Click toggles; clicking again closes.
    await product.click();
    await expect(page.getByRole("menu", { name: "Product" })).toBeVisible();
    await product.click();
    await expect(page.getByRole("menu", { name: "Product" })).toBeHidden();

    // Switching tabs quickly never leaves a stuck panel: exactly one panel at the end.
    const tryIt = nav.getByRole("button", { name: "Try it" });
    const about = nav.getByRole("button", { name: "About" });
    for (const t of [product, tryIt, about, product, tryIt, about]) await t.hover();
    await expect(page.getByRole("menu")).toHaveCount(1);
    await expect(page.getByRole("menu", { name: "About" })).toBeVisible();
    await page.mouse.move(700, 600);
    await expect(page.getByRole("menu")).toHaveCount(0);

    // Keyboard: focus the tab, Enter opens, ArrowRight moves to the next tab's panel, Escape closes and returns focus.
    await product.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu", { name: "Product" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("menu", { name: "Try it" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(tryIt).toBeFocused();

    // ArrowDown moves into the panel's first item.
    await product.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: /Capture proof/ })).toBeFocused();
    await page.keyboard.press("Escape");

    // Every item navigates and the panel closes when the route changes.
    await product.click();
    await page.getByRole("menuitem", { name: /Answer disputes/ }).click();
    await expect(page).toHaveURL(/\/disputes$/);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await tryIt.click();
    await page.getByRole("menuitem", { name: /Make a test sale/ }).click();
    await expect(page).toHaveURL(/\/store$/);
    await product.click();
    await page.getByRole("menuitem", { name: /Limitation pack/ }).click();
    await expect(page).toHaveURL(/\/limitation$/);

    // About opens external links safely.
    await about.click();
    const github = page.getByRole("menuitem", { name: /GitHub/ });
    await expect(github).toHaveAttribute("target", "_blank");
    await expect(github).toHaveAttribute("rel", /noopener/);
    await expect(github).toHaveAttribute("href", "https://github.com/KarthikVishwaa/ostraca");

    // Outside click closes.
    await page.mouse.click(700, 700);
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("mobile: the menu opens, shows the groups, and a link navigates and closes it", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile-only");
    await page.goto("/");
    await settle(page);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await page.getByRole("button", { name: "Open menu" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    for (const g of ["Product", "Try it", "About"]) await expect(sheet.getByRole("heading", { name: g })).toBeVisible();
    // Touch targets are at least 44px tall.
    const box = await sheet.getByRole("link", { name: /Make a test sale/ }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await sheet.getByRole("link", { name: /Make a test sale/ }).click();
    await expect(page).toHaveURL(/\/store$/);
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
