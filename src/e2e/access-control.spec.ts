import { expect, test } from "@playwright/test";

/**
 * Unauthenticated access control — real authorization tests, not just
 * "the page loads". A protected route responding with anything other than
 * a redirect-to-login (or a rendered login page) for a signed-out visitor
 * is a genuine security bug: middleware.ts's `requireAuth` gate (or a
 * page's own session check) failing open, a Server Component throwing an
 * unhandled "User not found" that bubbles into Next's default error
 * boundary (a 500), etc. These assertions are deliberately strict about
 * status code, not just "some page rendered".
 */

test.describe("unauthenticated access control", () => {
  test("GET / renders the login page (never a redirect loop, never a 500)", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);

    // src/app/page.tsx renders <LogIn/> directly for a signed-out visitor —
    // assert on real login-page content, not just "a 2xx came back".
    await expect(page.getByRole("heading")).toBeVisible();
    await expect(page.locator("form, button, a").first()).toBeVisible();
  });

  const protectedPaths = ["/chat", "/admin", "/customers", "/briefs"];

  for (const path of protectedPaths) {
    test(`GET ${path} redirects an unauthenticated visitor to login (not 500, not the protected content)`, async ({
      page,
    }) => {
      const response = await page.goto(path);

      // The one thing this test must never accept: a 5xx. Whatever else
      // happens, a protected route throwing an unhandled server error for a
      // signed-out visitor is always a bug, redirect-gap or not.
      expect(response?.status(), `GET ${path} must not 5xx for an unauthenticated visitor`).toBeLessThan(
        500
      );

      // middleware.ts redirects to `/` for every path in its `requireAuth`
      // list; `/` itself renders the login page directly. Either way, a
      // signed-out visitor must end up looking at the login page — never
      // at the protected page's own content.
      await expect(
        page.getByRole("heading"),
        `GET ${path} must land on/render the login page for an unauthenticated visitor`
      ).toBeVisible();

      const finalUrl = new URL(page.url());
      expect(
        finalUrl.pathname,
        `GET ${path} must not leave an unauthenticated visitor sitting on ${path} itself`
      ).not.toBe(path);
    });
  }
});
