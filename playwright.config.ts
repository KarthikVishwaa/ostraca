import "dotenv/config";
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests against the PayPal sandbox only. :3000 is the dev server (reused if running); :3100 runs without AI
 * keys and :3200 with AI_DAILY_CALL_CAP=0, both from `next start`, so build first.
 */
const sandbox = /^https:\/\/api-m\.sandbox\.paypal\.com\/?$/.test(process.env.PAYPAL_API_BASE ?? "");
if (!sandbox) {
  throw new Error(`Refusing to run the E2E suite: PAYPAL_API_BASE must be https://api-m.sandbox.paypal.com (it is "${process.env.PAYPAL_API_BASE ?? "not set"}").`);
}

const built = existsSync(".next/BUILD_ID");
const PORT_MAIN = 3000;
const PORT_AI_OFF = 3100;
const PORT_CAP = 3200;

const base = { trace: "retain-on-failure", screenshot: "only-on-failure", video: "off", actionTimeout: 15_000, navigationTimeout: 45_000 } as const;
const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: "./e2e/tests",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // the tests share one set of test rows, so they run one at a time
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: { baseURL: `http://localhost:${PORT_MAIN}`, ...base },
  projects: [
    { name: "desktop", testMatch: /\.(desktop|both)\.spec\.ts$/, use: { ...desktop } },
    {
      name: "mobile",
      testMatch: /\.both\.spec\.ts$/,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    { name: "ai-off", testMatch: /\.ai-off\.spec\.ts$/, use: { ...desktop, baseURL: `http://localhost:${PORT_AI_OFF}` } },
    { name: "ai-cap", testMatch: /\.ai-cap\.spec\.ts$/, use: { ...desktop, baseURL: `http://localhost:${PORT_CAP}` } },
  ],
  webServer: [
    { command: "npm run dev", url: `http://localhost:${PORT_MAIN}`, reuseExistingServer: true, timeout: 180_000, stdout: "ignore", stderr: "pipe" },
    ...(built
      ? [
          {
            command: `npx next start -p ${PORT_AI_OFF}`,
            url: `http://localhost:${PORT_AI_OFF}/api/health`,
            reuseExistingServer: false,
            timeout: 90_000,
            env: { ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "" },
            stdout: "ignore" as const,
            stderr: "pipe" as const,
          },
          {
            command: `npx next start -p ${PORT_CAP}`,
            url: `http://localhost:${PORT_CAP}/api/health`,
            reuseExistingServer: false,
            timeout: 90_000,
            env: { AI_DAILY_CALL_CAP: "0" },
            stdout: "ignore" as const,
            stderr: "pipe" as const,
          },
        ]
      : []),
  ],
});
