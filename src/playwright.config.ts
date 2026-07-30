import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E scaffold — QA/security smoke coverage that doesn't need a
 * real Entra ID session (see the `test.skip(...)` TODOs in
 * `e2e/authenticated-journeys.spec.ts` for what needs one and why). Kept
 * deliberately separate from vitest.config.ts (unit tests only, no
 * browser) — `npm run test` never launches a browser, `npm run test:e2e`
 * never runs under vitest.
 *
 * `E2E_BASE_URL` selects the target:
 *  - unset -> `http://localhost:3000`, and Playwright manages a local
 *    `next build && next start` server for the run (see `webServer` below —
 *    a production build so PWA/service-worker assertions are meaningful;
 *    `next dev` never registers the service worker, see next.config.js).
 *  - set to any other origin (e.g. the live validation site) -> Playwright
 *    does NOT try to start/manage a server; it just runs the specs against
 *    that already-running deployment.
 */
const DEFAULT_BASE_URL = "http://localhost:3000";
const baseURL = process.env.E2E_BASE_URL || DEFAULT_BASE_URL;
const isLocalTarget = baseURL === DEFAULT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],

  use: {
    baseURL,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Only manage a local dev/prod server when actually targeting localhost —
  // running against E2E_BASE_URL=https://val1-sales360.pixelflow.dk (or any
  // other already-live deployment) must never try to spawn `next start` on
  // top of it.
  webServer: isLocalTarget
    ? {
        command: "npm run build && npm run start",
        url: DEFAULT_BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      }
    : undefined,
});
