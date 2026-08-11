import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression test for the val1 login defect fixed in commit a9eead3
 * (fix(auth): await redirect helpers — un-awaited NEXT_REDIRECT was
 * swallowed).
 *
 * THE BUG: `redirectIfAuthenticated()` called `RedirectToPage("chat")`
 * WITHOUT `await`. `RedirectToPage` is async ("use server" modules require
 * every export to be async under Next.js 15) and Next's `redirect()` works
 * by THROWING `NEXT_REDIRECT`. Called without `await`, that throw lands in
 * a floating promise — it's swallowed as an unhandled rejection instead of
 * propagating out of `redirectIfAuthenticated()` — so the function returned
 * normally and `app/page.tsx` went on to render the LOGIN PAGE to a user
 * who was already authenticated. Entra sign-in succeeded, the session
 * cookie was set, and the user still saw the login screen.
 *
 * THE FIX: `await RedirectToPage("chat")`.
 *
 * WHAT THIS TEST PROVES: not the symptom (a rendered page — this is a
 * hermetic unit test, no DOM/Next runtime involved) but the mechanism —
 * that `redirectIfAuthenticated()` actually awaits `RedirectToPage`. The
 * mocked `RedirectToPage` returns a promise that REJECTS with a
 * NEXT_REDIRECT-like sentinel, mirroring what Next's real `redirect()` does
 * under the hood. Under the PRE-FIX code (`RedirectToPage("chat");`, no
 * `await`), that rejection floats and `redirectIfAuthenticated()` resolves
 * `undefined` instead of rejecting — so the "rejects with the sentinel"
 * assertion below would FAIL, exactly reproducing the regression. Under the
 * FIX (`await RedirectToPage("chat")`), the rejection propagates out of
 * `redirectIfAuthenticated()` itself, and the assertion passes.
 *
 * Mocking pattern mirrors helpers.test.ts: mock next-auth's
 * `getServerSession` and `./auth-api`'s `options` so this file never pulls
 * in real NextAuth/provider configuration — the "authenticated session" is
 * therefore controlled indirectly via the mocked session shape (exactly
 * what `userSession()` reads), not by mocking the `userSession` export of
 * the module under test directly. `RedirectToPage` is mocked via its real
 * import path, `../common/navigation-helpers`.
 */
const getServerSessionMock = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSessionMock(...args),
}));
vi.mock("./auth-api", () => ({ options: {} }));

const redirectToPageMock = vi.fn();
vi.mock("../common/navigation-helpers", () => ({
  RedirectToPage: (...args: unknown[]) => redirectToPageMock(...args),
}));

import { redirectIfAuthenticated } from "./helpers";

// Stand-in for what Next.js's real `redirect()` throws — an object with a
// `NEXT_REDIRECT` digest. The test only needs a distinguishable sentinel
// value; it does not need to be byte-for-byte what Next produces.
const NEXT_REDIRECT_SENTINEL = Object.assign(new Error("NEXT_REDIRECT"), {
  digest: "NEXT_REDIRECT;push;/chat;307;",
});

const authenticatedSession = {
  user: {
    name: "Real Seller Name",
    email: "seller@example.com",
    image: "https://example.com/avatar.png",
    isAdmin: false,
    oid: "7d37f13b-d198-4421-81c6-f0f9076049c7",
    tenantId: "d4b1b55b-6c92-4419-9a08-956e975dce86",
  },
};

describe("redirectIfAuthenticated() — regression guard for a9eead3 (un-awaited RedirectToPage swallowed NEXT_REDIRECT)", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    redirectToPageMock.mockReset();
  });

  it("propagates (rejects with) RedirectToPage's NEXT_REDIRECT-like throw when a session exists — proves the call is awaited, not fire-and-forget", async () => {
    getServerSessionMock.mockResolvedValueOnce(authenticatedSession);
    redirectToPageMock.mockRejectedValueOnce(NEXT_REDIRECT_SENTINEL);

    await expect(redirectIfAuthenticated()).rejects.toBe(NEXT_REDIRECT_SENTINEL);
    expect(redirectToPageMock).toHaveBeenCalledWith("chat");
  });

  it("resolves without calling RedirectToPage when there is no session — the unauthenticated path is unaffected by the fix", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    await expect(redirectIfAuthenticated()).resolves.toBeUndefined();
    expect(redirectToPageMock).not.toHaveBeenCalled();
  });
});
