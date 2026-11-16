import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests (Playwright).
 *
 * - CA runs in mock mode against its own throwaway data directory.
 * - CX pages run against **intercepted** `/api/*` responses (see
 *   tests/e2e/fixtures/cxApi.ts), so no test ever reaches Cosmos, Blob, Fabric
 *   or OpenAI - whatever the local .env points at.
 * - Sign-in is not bypassed in the app. The auth fixture signs a session
 *   cookie with the local SESSION_SECRET using the app's own signer.
 *
 * Port 3100, so a normal `npm run dev` on 3000 is left alone.
 */

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./tests/e2e/global-setup.ts",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],

  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `${BASE_URL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      CA_DATA_MODE: "mock",
      CA_PROJECT_SOURCE: "mock",
      CA_DRAWING_SOURCE: "mock",
      CA_MOCK_DATA_DIR: ".ca-dev-data/e2e",
      APP_BASE_URL: BASE_URL,
    },
  },
});
