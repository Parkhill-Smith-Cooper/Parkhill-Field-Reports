import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Unit tests (Vitest). Browser and print checks live in Playwright
 * (`playwright.config.ts`, `tests/e2e`).
 *
 * `server-only` throws when imported outside a React Server environment, which
 * is exactly what it should do in the app. In unit tests it is replaced by an
 * empty module so server modules can be tested directly.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
  },
});
