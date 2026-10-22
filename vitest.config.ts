import { defineConfig } from "vitest/config";

// Unit tests only (rules, simulation, protocol). Browser tests live in tests/e2e and run with Playwright.
export default defineConfig({
  test: { include: ["packages/**/test/**/*.test.ts", "apps/*/test/**/*.test.ts"], exclude: ["**/node_modules/**", "tests/e2e/**"] },
});
