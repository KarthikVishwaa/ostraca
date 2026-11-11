import zlib from "node:zlib";
import { expect, test as base, type Page, type Response } from "@playwright/test";

/**
 * Every test fails on a console error, a hydration warning, an uncaught page error, a failed request to
 * our own origin, or a 4xx/5xx from our /api that the test did not declare with allowApi().
 */
type Allow = { url: RegExp; status: number[] };
const allowed = new WeakMap<Page, Allow[]>();

/** Declare the API errors a test expects (for example PayPal refusing a fake capture). Everything else fails the test. */
export function allowApi(page: Page, rules: Array<{ url: RegExp; status: number[] }>) {
  allowed.set(page, [...(allowed.get(page) ?? []), ...rules]);
}

export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page, baseURL }, use) => {
      const problems: string[] = [];
      const origin = new URL(baseURL ?? "http://localhost:3000").origin;
      const ok = (r: Response) => (allowed.get(page) ?? []).some((a) => a.url.test(r.url()) && a.status.includes(r.status()));

      page.on("console", (m) => {
        const t = m.text();
        if (m.type() === "error") {
          // "Failed to load resource: ... 409" is already covered by the response check below, with its URL.
          if (/Failed to load resource/i.test(t)) return;
          problems.push(`console.error: ${t.slice(0, 300)}`);
        } else if (m.type() === "warning" && /hydrat|did not match|Warning:|not eligible for reset/i.test(t)) {
          problems.push(`console.warning: ${t.slice(0, 300)}`);
        }
      });
      page.on("pageerror", (e) => problems.push(`pageerror: ${String(e.message).slice(0, 300)}`));
      page.on("requestfailed", (r) => {
        if (!r.url().startsWith(origin)) return;
        if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(r.failure()?.errorText ?? "")) return; // a navigation or a cancelled prefetch
        problems.push(`requestfailed: ${r.method()} ${r.url()} ${r.failure()?.errorText}`);
      });
      page.on("response", (r) => {
        if (!r.url().startsWith(origin + "/api/")) return;
        if (r.status() >= 400 && !ok(r)) problems.push(`api ${r.status()}: ${r.request().method()} ${r.url().replace(origin, "")}`);
      });

      await use(problems);
      expect(problems, "the page must not emit console errors, hydration warnings, page errors or unexpected API failures").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Waits for the page to be quiet: no more than `ms` without network activity. */
export async function settle(page: Page, ms = 600) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(ms);
}

/** Document-level horizontal scroll check, in CSS pixels. */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** A tiny valid PNG, different on every call so it never matches a file already stored. */
export function uniquePng(): Buffer {
  const crc = (b: Buffer) => zlib.crc32(b) >>> 0;
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const rgb = [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)];
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 8 }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: 8 }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
