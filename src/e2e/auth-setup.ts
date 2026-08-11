/**
 * Captures a Playwright `storageState` from a REAL Entra login, so the
 * authenticated E2E suite can run.
 *
 * ── Why a human is involved at all ──────────────────────────────────────
 *
 * There is no way to mint this session non-interactively without weakening
 * something, and every shortcut was checked and rejected:
 *
 *   - Client-credentials / `az account get-access-token` produce an APP or
 *     ARM token. NextAuth's session cookie is minted only by the authorization
 *     -code callback; there is no supported exchange.
 *   - ROPC (username/password grant) would need a stored password, is blocked
 *     for MSA-federated accounts like this tenant's, and is exactly the kind
 *     of credential handling this project has ruled out.
 *   - Reusing the operator's everyday Chrome session does not work either:
 *     Playwright has its own cookie jar, and the NextAuth cookies are
 *     `httpOnly`, so they cannot be read out of another browser by script.
 *     (Confirmed empirically — a live Entra session in Chrome authenticates
 *     that browser and nothing else.)
 *   - A test-only bypass provider would mean the E2E suite stops testing the
 *     real auth path, which is the one thing it exists to test.
 *
 * So: one interactive login. This script reduces that to its minimum.
 *
 * ── What makes it cheap after the first time ────────────────────────────
 *
 * The browser runs against a PERSISTENT profile (`.auth/profile`), so Entra's
 * own session cookie survives between runs. The first run needs a real login;
 * later runs typically need one click on the account tile, or nothing at all,
 * until Entra's session expires. Both the profile and the exported state are
 * gitignored — `storageState` contains a live session cookie and is a secret.
 *
 * Usage:
 *   npx tsx e2e/auth-setup.ts            # capture, then print the export line
 *   npm run e2e:auth                     # same thing
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.E2E_BASE_URL || "https://val1-sales360.pixelflow.dk";
const AUTH_DIR = path.join(__dirname, "..", ".auth");
const PROFILE_DIR = path.join(AUTH_DIR, "profile");
const STATE_PATH = path.join(AUTH_DIR, "storage-state.json");

/** Generous: a human may need to fetch a phone for MFA. */
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

async function main(): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });

  const page = context.pages()[0] ?? (await context.newPage());

  console.log(`\n  Opening ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  // If the persistent profile still holds a valid app session, there is
  // nothing for the human to do.
  const alreadyIn = await hasSession(page);
  if (!alreadyIn) {
    const signIn = page.getByRole("button", { name: /Microsoft 365/i });
    if (await signIn.count()) {
      await signIn.first().click();
    }

    console.log(
      "\n  ┌──────────────────────────────────────────────────────────┐\n" +
        "  │  Complete the Microsoft sign-in in the browser window.   │\n" +
        "  │  Pick the account if prompted. Nothing else is needed —  │\n" +
        "  │  this script continues on its own once you land back.    │\n" +
        "  └──────────────────────────────────────────────────────────┘\n"
    );

    // Wait for the app to actually consider us signed in, rather than for a
    // URL — a URL can be reached while the session cookie is still not set,
    // which is precisely how an earlier "login worked" claim turned out to be
    // reading a cached response.
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    let ok = false;
    while (Date.now() < deadline) {
      if (await hasSession(page)) {
        ok = true;
        break;
      }
      await page.waitForTimeout(2000);
    }

    if (!ok) {
      await context.close();
      throw new Error(
        `No authenticated session after ${LOGIN_TIMEOUT_MS / 1000}s. Nothing was written.`
      );
    }
  }

  await context.storageState({ path: STATE_PATH });
  fs.chmodSync(STATE_PATH, 0o600);

  // Report identity WITHOUT printing the session cookie or the user's email:
  // this output lands in terminals and CI logs.
  const claims = await page.evaluate(async () => {
    const s = await fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json());
    const u = s.user ?? {};
    return {
      tenantId: u.tenantId ?? null,
      oidPrefix: u.oid ? String(u.oid).slice(0, 8) : null,
      isAdmin: u.isAdmin === true,
    };
  });

  console.log("  Session captured.");
  console.log(`    tenantId : ${claims.tenantId}`);
  console.log(`    oid      : ${claims.oidPrefix}… (truncated)`);
  console.log(`    isAdmin  : ${claims.isAdmin}`);
  if (!claims.isAdmin) {
    console.log(
      "\n  NOTE: isAdmin is false. The admin-portal tests will be skipped.\n" +
        "  Add this account's oid to the ADMIN_OBJECT_IDS app setting to include them."
    );
  }
  console.log(`\n  Wrote ${STATE_PATH}\n`);
  console.log("  Run the authenticated suite with:\n");
  console.log(`    E2E_STORAGE_STATE=${STATE_PATH} npx playwright test e2e/authenticated-journeys.spec.ts\n`);

  await context.close();
}

/** True only when the server itself reports a user — never inferred from the URL. */
async function hasSession(page: import("@playwright/test").Page): Promise<boolean> {
  try {
    return await page.evaluate(async () => {
      const r = await fetch("/api/auth/session", { cache: "no-store" });
      const s = await r.json();
      return Boolean(s && s.user);
    });
  } catch {
    return false;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
