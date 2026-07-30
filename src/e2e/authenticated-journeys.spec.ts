import { test } from "@playwright/test";

/**
 * Journeys that require an actual authenticated session. These are
 * deliberately left `test.skip` rather than faked/mocked — this app's only
 * production auth path is Microsoft Entra ID (`AzureADProvider`,
 * src/features/auth-page/auth-api.ts), which redirects to Microsoft's own
 * hosted login UI (a Microsoft-controlled domain, MFA-capable, outside this
 * app entirely). Scripting that without a dedicated test identity would
 * mean either:
 *  (a) hard-coding a real Entra ID test user's credentials in this repo
 *      (a secret this project's own rules — CLAUDE.md "no API keys
 *      anywhere", "no stored credentials" — forbid keeping in source), or
 *  (b) faking the NextAuth session cookie/JWT to bypass Entra ID entirely,
 *      which would stop testing real auth and start testing a mock of it.
 *
 * TODO(Kristjan): to unskip these, provision one of:
 *  - A dedicated Entra ID test-user account (non-production tenant or a
 *    scoped test user in the InsightCast tenant) whose credentials are
 *    injected via CI secrets (e.g. `E2E_TEST_USER_EMAIL` /
 *    `E2E_TEST_USER_PASSWORD`), scripted via Playwright driving the actual
 *    Microsoft login redirect — OR
 *  - A NextAuth `CredentialsProvider` test-only escape hatch gated to
 *    non-production environments (mirrors the existing dev-mode credentials
 *    provider in auth-api.ts), so E2E can sign in without touching
 *    Microsoft's hosted UI at all.
 * Until one of those exists, this file exists so the coverage GAP is
 * visible in the test run (skipped, not silently absent) rather than
 * something a future contributor has to notice is simply missing.
 */
test.describe("authenticated journeys", () => {
  test.skip(
    "an authenticated seller can open /chat and send a message",
    // TODO(Kristjan): needs E2E_TEST_USER_EMAIL/PASSWORD (or a test-only
    // CredentialsProvider) to actually sign in via Entra ID before this can run.
    () => {}
  );

  test.skip(
    "an authenticated seller can view their /customers list",
    // TODO(Kristjan): same credential gap as above.
    () => {}
  );

  test.skip(
    "an authenticated seller can view their saved /briefs",
    // TODO(Kristjan): same credential gap as above.
    () => {}
  );

  test.skip(
    "an admin user can reach /admin and /reporting (isAdmin-gated)",
    // TODO(Kristjan): needs a test user flagged isAdmin=true in Cosmos, on
    // top of the same Entra ID credential gap as above.
    () => {}
  );
});
