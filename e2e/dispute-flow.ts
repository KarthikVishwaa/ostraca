import type { APIRequestContext, Page } from "@playwright/test";
import { allowApi, expect, test } from "./fixtures";

/** The dispute to use: E2E_DISPUTE_ID, or the first one PayPal lists for this merchant. */
export async function disputeId(request: APIRequestContext): Promise<string> {
  if (process.env.E2E_DISPUTE_ID) return process.env.E2E_DISPUTE_ID;
  const r = await request.get("/api/disputes");
  expect(r.status(), "GET /api/disputes").toBe(200);
  const list = (await r.json()) as Array<{ id: string }>;
  if (!list.length) throw new Error("PayPal lists no disputes for this sandbox merchant. Set E2E_DISPUTE_ID or file a dispute as the sandbox buyer first.");
  return list[0].id;
}

export async function watchPercentages(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __pcts: number[]; __labels: string[] };
    w.__pcts = [];
    w.__labels = [];
    new MutationObserver(() => {
      const e = document.querySelector('[data-testid="task-pct"]');
      const v = e ? parseInt(e.textContent ?? "", 10) : NaN;
      if (!Number.isNaN(v) && w.__pcts[w.__pcts.length - 1] !== v) w.__pcts.push(v);
      const l = document.querySelector('[data-testid="task-progress"] [aria-live]')?.textContent?.trim();
      if (l && w.__labels[w.__labels.length - 1] !== l) w.__labels.push(l);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}
export const readPercentages = (page: Page) => page.evaluate(() => ({ pcts: (window as unknown as { __pcts: number[] }).__pcts, labels: (window as unknown as { __labels: string[] }).__labels }));

/**
 * The whole dispute journey as a seller would do it: draft (with progress), break it with a wrong tracking
 * number, restore it, queue it for approval, approve it.
 */
export async function runDisputeJourney(page: Page, id: string, opts: { button: RegExp; expectRealAi: boolean }) {
  allowApi(page, [{ url: /\/api\/actions\/[^/]+\/approve/, status: [400, 404, 409, 422, 429, 502] }]);
  await page.goto(`/disputes/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(id);
  await expect(page.getByText(/Status is read from PayPal/)).toBeVisible();

  // Draft, with real stage progress.
  await watchPercentages(page);
  const draftButton = page.getByRole("button", { name: opts.button });
  await expect(draftButton).toBeEnabled();
  await draftButton.click();
  await expect(draftButton).toBeDisabled(); // no double submission while it runs
  await expect(page.getByTestId("task-progress")).toBeVisible();
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-status", "done", { timeout: 120_000 });
  const { pcts, labels } = await readPercentages(page);
  expect(pcts.length, `percentages seen: ${pcts.join(", ")}`).toBeGreaterThanOrEqual(3);
  expect([...pcts].sort((a, b) => a - b), "the percentage never goes backwards").toEqual(pcts);
  expect(pcts[pcts.length - 1]).toBe(100);
  expect(pcts.slice(0, -1).every((p) => p < 100), "100% only when the result is ready").toBe(true);
  expect(labels.join(" | ")).toMatch(/Collecting verified facts/);
  expect(labels.join(" | ")).toMatch(/Checking every citation and number/);
  if (opts.expectRealAi) {
    expect(labels.join(" | ")).toMatch(/Writing the draft/);
    expect(pcts.some((p) => p > 15 && p < 80), "AI writing progress between 15% and 80%").toBe(true);
  }

  const textarea = page.getByRole("textbox", { name: "Response draft" });
  await expect(textarea).not.toHaveValue("");
  if (opts.expectRealAi) await expect(page.getByText(/Checks passed|AI could not write this/)).toBeVisible();
  else await expect(page.getByText(/plain template|AI could not write this/).first()).toBeVisible();
  await expect(page.getByText(/Checks passed/)).toBeVisible({ timeout: 20_000 });
  const original = await textarea.inputValue();

  // A wrong tracking number is caught by code: red warning, and the queue button is disabled.
  await textarea.fill(`${original}\n\nThe parcel had tracking number EE999999999IN [F1].`);
  await expect(page.getByText("This draft cannot be approved yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Queue for approval" })).toBeDisabled();

  // Restore it and queue it.
  await textarea.fill(original);
  await expect(page.getByText(/Checks passed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Queue for approval" })).toBeEnabled();
  await page.getByRole("button", { name: "Queue for approval" }).click();
  await expect(page.getByText("Ready to send to PayPal")).toBeVisible();

  // If PayPal would accept evidence for this dispute right now, Approve would really send it and change the dispute
  // in the sandbox, which cannot be undone. Then the test stops before the click and only checks the button is ready.
  const live = (await (await page.request.get(`/api/disputes/${id}`)).json()) as { dispute: { can: { provideEvidence: boolean } } };
  if (live.dispute.can.provideEvidence) {
    test.info().annotations.push({ type: "approve not clicked", description: "PayPal currently accepts evidence for this dispute; approving would change it for real." });
    await expect(page.getByRole("button", { name: /Approve and send to PayPal|Approve and retry/ })).toBeEnabled();
    await expect(page.getByText(/Status is read from PayPal/)).toBeVisible();
    return;
  }

  // Approve: either PayPal accepts it, or we see PayPal's real message. Never a crash or a bare 500.
  const approveResponse = page.waitForResponse((r) => /\/api\/actions\/[^/]+\/approve/.test(r.url()) && r.request().method() === "POST");
  await page.getByRole("button", { name: /Approve and send to PayPal|Approve and retry/ }).click();
  const res = await approveResponse;
  expect(res.status(), "approve must not be a bare 500").not.toBe(500);
  const type = res.headers()["content-type"] ?? "";
  expect(type).toMatch(/json/); // ndjson stream or JSON error, never an HTML error page
  // A stream always answers 200 once it has started; its last line says how it ended.
  let ended: { ok: boolean; status: number; message: string };
  const text = await res.text();
  if (type.includes("ndjson")) {
    const last = JSON.parse(text.trim().split("\n").pop()!) as { type: string; status?: number; error?: { message: string } };
    expect(["result", "error"], "the stream must end with a result or an error").toContain(last.type);
    ended = { ok: last.type === "result", status: last.status ?? 200, message: last.error?.message ?? "" };
  } else {
    const body = JSON.parse(text) as { error?: { message: string } };
    ended = { ok: res.ok(), status: res.status(), message: body.error?.message ?? "" };
  }
  expect(ended.status, "approve must not end in a 500").not.toBe(500);
  if (!ended.ok) expect(ended.message.length, "PayPal's real message is returned").toBeGreaterThan(3);
  if (ended.ok) {
    await expect(page.getByText(/Evidence was sent to PayPal/)).toBeVisible({ timeout: 60_000 });
  } else {
    await expect(page.getByTestId("task-error")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("task-error")).toContainText(/\w{4,}/); // a real message, not empty
  }
  // Either way the page shows the status read from PayPal and is still usable.
  await expect(page.getByText(/Status is read from PayPal/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(id);
}
