import { expect, test, type Page, type Request, type Response } from "@playwright/test";

/**
 * Regression coverage for the val1 defect fixed in commit dc9eb8e
 * (next.config.js): clicking "Microsoft 365" showed a loading spinner and
 * never navigated to Entra ID. Root cause was `@ducanh2912/next-pwa`'s
 * `defaultCache` putting `GET /api/auth/csrf` into a 24h `NetworkFirst`
 * cache named `apis` — `signIn()` replayed a stale CSRF token, the
 * downstream POST failed CSRF validation, and `signIn()` resolved without a
 * redirect URL. The fix is a blanket `NetworkOnly` rule for every
 * same-origin `/api/*` route, registered before the library's default
 * `apis` rule (Workbox is first-match-wins).
 *
 * This spec clicks the REAL rendered "Microsoft 365" button (features/
 * auth-page/login.tsx) — it never calls `signIn()` directly and never POSTs
 * to `/api/auth/*` by hand — and asserts on the resulting network trace,
 * navigation, and (for context C) Cache Storage contents. It deliberately
 * stops at the Entra ID hosted login page: no test credentials exist for
 * this app (see `authenticated-journeys.spec.ts`), and entering them is out
 * of scope for this regression check.
 *
 * Three contexts, because the bug was specifically about a SECOND load
 * under an active, cache-primed service worker — a fresh, SW-less load
 * never reproduced it:
 *   A. Fresh context, no service worker at all — the control case.
 *   B. Service-worker controlled (reload until `navigator.serviceWorker
 *      .controller` is non-null) — this is the exact case that was broken.
 *   C. Primed-cache regression — explicitly warms whatever caching rule
 *      exists for `/api/auth/csrf` before clicking, then proves both that
 *      the click still works AND (directly, not by inference) that no
 *      `/api/auth/*` entry exists in ANY Cache Storage bucket.
 *
 * Run against an already-deployed target via E2E_BASE_URL (see
 * playwright.config.ts); defaults to https://val1-sales360.pixelflow.dk.
 */

const EXPECTED_TENANT_ID = "d4b1b55b-6c92-4419-9a08-956e975dce86";
// AZURE_AD_CLIENT_ID is an Azure AD *application* id, not a client secret —
// but per this project's hard rule ("never print secret values, never fetch
// app-setting values"), this spec does not read it from Azure and hardcode
// it here. Instead it validates the client_id the live authorize URL
// actually contains: non-empty and syntactically a GUID. That is the
// correct, non-secret-touching way to confirm "the correct client_id" is
// present without this file ever having seen or stored the value.
const GUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ClickResult {
  csrfResponses: Response[];
  signinPostRequests: Request[];
  consoleErrors: string[];
  finalUrl: string;
}

/**
 * Clicks the real "Microsoft 365" button and captures the network/console
 * trace up through the moment the browser actually navigates to Entra ID.
 * Fails (via the `waitForURL` timeout) exactly the way the live defect
 * manifested: a click that never leaves val1-sales360.pixelflow.dk.
 */
async function clickMicrosoft365AndCapture(page: Page): Promise<ClickResult> {
  const csrfResponses: Response[] = [];
  const signinPostRequests: Request[] = [];
  const consoleErrors: string[] = [];

  const onConsole = (msg: import("@playwright/test").ConsoleMessage) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  };
  const onPageError = (err: Error) => consoleErrors.push(String(err));
  const onResponse = (response: Response) => {
    if (new URL(response.url()).pathname === "/api/auth/csrf") {
      csrfResponses.push(response);
    }
  };
  const onRequest = (request: Request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/auth/signin/azure-ad"
    ) {
      signinPostRequests.push(request);
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);
  page.on("request", onRequest);

  const button = page.getByRole("button", { name: "Microsoft 365" });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();

  // The live defect: this button click resolved to a permanent spinner and
  // NO navigation. A bounded wait here is the direct proof the button
  // never gets stuck — if the bug regresses, this line times out and the
  // test fails, rather than the test silently accepting a stuck page.
  await page.waitForURL(/^https:\/\/login\.microsoftonline\.com\//, {
    timeout: 20_000,
  });

  const finalUrl = page.url();

  // Stop recording before Microsoft's own hosted login page starts
  // producing its own console traffic — that's not this app's code and is
  // out of scope for the "zero console errors" assertion below.
  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  page.off("response", onResponse);
  page.off("request", onRequest);

  return { csrfResponses, signinPostRequests, consoleErrors, finalUrl };
}

function assertReachedEntraAuthorize(finalUrl: string) {
  const url = new URL(finalUrl);
  expect(url.hostname).toBe("login.microsoftonline.com");
  expect(url.pathname).toContain(EXPECTED_TENANT_ID);

  const params = url.searchParams;
  expect(params.get("response_type")).toBe("code");

  const clientId = params.get("client_id");
  expect(clientId, "authorize URL must carry a client_id").toBeTruthy();
  expect(clientId).toMatch(GUID_FORMAT);

  const redirectUri = params.get("redirect_uri");
  expect(redirectUri, "authorize URL must carry a redirect_uri").toBeTruthy();
  expect(new URL(redirectUri!).hostname).toBe("val1-sales360.pixelflow.dk");
}

function assertCsrfServedFromNetwork(csrfResponses: Response[]) {
  expect(
    csrfResponses.length,
    "expected at least one GET /api/auth/csrf during the sign-in click"
  ).toBeGreaterThan(0);
  for (const response of csrfResponses) {
    expect(response.status()).toBe(200);
  }
  // NOTE: Playwright's Response#fromServiceWorker() is NOT a usable signal
  // here — it is true for ANY request an active SW's fetch handler
  // intercepts via respondWith(), including a NetworkOnly-routed one that
  // performs a genuine live fetch(). It cannot distinguish "SW proxied a
  // real network call" from "SW served a cached hit". The actual,
  // unambiguous proof that CSRF was never cache-served is Cache Storage
  // itself: assertNoAuthApiCacheEntries() below is the real check.
}

function assertSigninPosted(signinPostRequests: Request[]) {
  expect(
    signinPostRequests.length,
    "expected at least one POST /api/auth/signin/azure-ad during the sign-in click"
  ).toBeGreaterThan(0);
}

/**
 * Enumerates every Cache Storage bucket and every entry whose PATHNAME
 * starts with /api/auth/ — i.e. an actual cached HTTP response for an auth
 * API route. Deliberately pathname-based, not a full-URL substring match:
 * next-pwa precaches static JS chunks whose *filenames* embed the route's
 * source path (e.g. `/_next/static/chunks/app/(authenticated)/api/auth/
 * [...nextauth]/route-<hash>.js`), which contains the literal string
 * "api/auth" without being a cached API response at all. A substring match
 * on the full URL flags that build artifact as a false positive; pathname
 * prefix matching correctly excludes it (its pathname starts with
 * `/_next/static/`, not `/api/auth/`).
 */
async function listAuthCacheEntries(page: Page): Promise<Array<{ cache: string; url: string }>> {
  return page.evaluate(async () => {
    const found: Array<{ cache: string; url: string }> = [];
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      for (const req of requests) {
        if (new URL(req.url).pathname.startsWith("/api/auth/")) {
          found.push({ cache: name, url: req.url });
        }
      }
    }
    return found;
  });
}

async function assertNoAuthApiCacheEntries(page: Page, when: string) {
  const entries = await listAuthCacheEntries(page);
  expect(entries, `no /api/auth/* Cache Storage entry should exist ${when}`).toEqual([]);
}

// ---------------------------------------------------------------------------
// Context A — fresh context, no service worker.
// ---------------------------------------------------------------------------

test.describe("Context A: fresh context, no service worker", () => {
  test("clicking Microsoft 365 reaches Entra with a network-served CSRF token", async ({
    page,
  }) => {
    await page.goto("/");

    const hasController = await page.evaluate(
      () => !!navigator.serviceWorker && !!navigator.serviceWorker.controller
    );
    expect(hasController, "context A must start with no active SW controller").toBe(false);

    const result = await clickMicrosoft365AndCapture(page);

    assertCsrfServedFromNetwork(result.csrfResponses);
    assertSigninPosted(result.signinPostRequests);
    assertReachedEntraAuthorize(result.finalUrl);
    expect(result.consoleErrors, "expected zero console errors during sign-in click").toEqual(
      []
    );

    // The page is now on login.microsoftonline.com (a different origin with
    // its own, irrelevant Cache Storage) — navigate back to val1's own
    // origin before inspecting ITS Cache Storage. Cache Storage persists
    // across navigations within the same origin, so this is a clean,
    // non-racy way to inspect post-click state without fighting the
    // execution-context teardown that happens mid-redirect.
    await page.goto("/");
    await assertNoAuthApiCacheEntries(page, "after a no-SW sign-in click");
  });
});

// ---------------------------------------------------------------------------
// Context B — service-worker controlled (the case that was broken).
// ---------------------------------------------------------------------------

test.describe("Context B: service-worker controlled (second load)", () => {
  test("clicking Microsoft 365 still reaches Entra once the SW controls the page", async ({
    page,
  }) => {
    await page.goto("/");
    // register: true in next.config.js — wait for the SW to actually
    // activate rather than assuming it's ready immediately after goto().
    await page.evaluate(() =>
      navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => undefined) : Promise.resolve()
    );

    let controlled = await page.evaluate(() => !!navigator.serviceWorker?.controller);
    for (let attempt = 0; attempt < 5 && !controlled; attempt++) {
      await page.reload();
      await page.evaluate(() =>
        navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => undefined) : Promise.resolve()
      );
      controlled = await page.evaluate(() => !!navigator.serviceWorker?.controller);
    }
    expect(controlled, "expected navigator.serviceWorker.controller to be non-null").toBe(true);

    const result = await clickMicrosoft365AndCapture(page);

    assertCsrfServedFromNetwork(result.csrfResponses);
    assertSigninPosted(result.signinPostRequests);
    assertReachedEntraAuthorize(result.finalUrl);
    expect(result.consoleErrors, "expected zero console errors during sign-in click").toEqual(
      []
    );

    // See Context A for why we navigate back to val1's own origin before
    // inspecting Cache Storage rather than checking it mid-redirect.
    await page.goto("/");
    await assertNoAuthApiCacheEntries(page, "after an SW-controlled sign-in click");
  });
});

// ---------------------------------------------------------------------------
// Context C — primed-cache regression (the decisive case).
// ---------------------------------------------------------------------------

test.describe("Context C: primed-cache regression", () => {
  test("warming /api/auth/csrf before the click does not resurrect a stale token", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() =>
      navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => undefined) : Promise.resolve()
    );

    // Explicitly warm whatever caching rule might exist for the CSRF route —
    // this is the exact request shape (`GET /api/auth/csrf`) the old
    // NetworkFirst "apis" cache captured and replayed stale for up to 24h.
    await page.evaluate(async () => {
      for (let i = 0; i < 5; i++) {
        await fetch("/api/auth/csrf", { credentials: "same-origin" }).catch(() => {
          /* ignore individual fetch failures — we only care whether a Cache
             Storage entry gets created, checked below */
        });
      }
    });

    // Let the SW's fetch handler / any cache.put() settle.
    await page.waitForTimeout(1500);

    await assertNoAuthApiCacheEntries(page, "after priming");

    // Reload so the click happens on a fresh navigation under the (now SW-
    // controlled, cache-primed) page — matches how the live defect actually
    // reproduced: a SECOND load, not the very first.
    await page.reload();
    await page.evaluate(() =>
      navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => undefined) : Promise.resolve()
    );

    const result = await clickMicrosoft365AndCapture(page);

    // The decisive assertions: the click still works (fresh CSRF, real
    // network hit, real navigation to Entra) even though we just tried our
    // best to get a stale token cached.
    assertCsrfServedFromNetwork(result.csrfResponses);
    assertSigninPosted(result.signinPostRequests);
    assertReachedEntraAuthorize(result.finalUrl);
    expect(result.consoleErrors, "expected zero console errors during sign-in click").toEqual(
      []
    );

    // The page is now on login.microsoftonline.com — navigate back to
    // val1's own origin before inspecting ITS Cache Storage (see Context A
    // for why: Cache Storage is per-origin and persists across same-origin
    // navigations, so this is non-racy and reflects real post-click state).
    await page.goto("/");

    // Direct proof (not inference from behavior): after the full flow,
    // Cache Storage still holds no /api/auth/* entry in any bucket —
    // including the library's own default cache named "apis".
    await assertNoAuthApiCacheEntries(page, "after the click");

    // Explicitly re-check the library's own default "apis" cache by name,
    // per the task's stated decisive check — a strict subset of the
    // all-buckets sweep above, kept separate so the "apis" cache
    // specifically is called out in output on failure.
    const apisCacheAuthKeys = await page.evaluate(async () => {
      const names = await caches.keys();
      if (!names.includes("apis")) return null;
      const cache = await caches.open("apis");
      const keys = await cache.keys();
      return keys.map((k) => k.url).filter((u) => new URL(u).pathname.startsWith("/api/auth/"));
    });
    if (apisCacheAuthKeys !== null) {
      expect(
        apisCacheAuthKeys,
        "the default 'apis' cache must never hold an /api/auth/* entry"
      ).toEqual([]);
    }
  });
});
