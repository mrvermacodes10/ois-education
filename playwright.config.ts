import { defineConfig, devices } from "@playwright/test";

// Browser tests for the website. On a Mac: `npx playwright install chromium webkit` once, then `npm run test:e2e`.
// In the cloud sandbox only Chromium is available (set CHROMIUM_PATH to use a preinstalled build).
const chromiumPath = process.env.CHROMIUM_PATH;
const macAir = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3200", trace: "retain-on-failure" },
  // Locally: the built website on :3200 and the room server in Cloudflare's local runtime on :8787.
  // With BASE_URL set (testing a deployment), nothing is started.
  webServer: process.env.BASE_URL ? undefined : [
    { command: "npm run start -w @ois/web -- -p 3200", url: "http://localhost:3200", reuseExistingServer: true, timeout: 60_000 },
    {
      command: "npm run dev -w @ois/server -- --persist-to .wrangler/e2e-state --log-level warn",
      url: "http://localhost:8787/api/health", reuseExistingServer: true, timeout: 60_000,
      env: { WRANGLER_SEND_METRICS: "false" },
    },
  ],
  projects: [
    { name: "chromium-mac-air", use: { ...devices["Desktop Chrome"], ...macAir, launchOptions: chromiumPath ? { executablePath: chromiumPath } : {} } },
    ...(process.env.WITH_WEBKIT ? [{ name: "webkit-mac-air", use: { ...devices["Desktop Safari"], ...macAir } }] : []),
  ],
});
