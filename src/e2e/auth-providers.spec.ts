import { expect, test } from "@playwright/test";

/**
 * `/api/auth/providers` is NextAuth's own built-in, unauthenticated
 * discovery endpoint (middleware.ts explicitly excludes `/api/auth` from
 * its `requireAuth` gate — "required to logon, i.e. requires anon access").
 * Asserting `azure-ad` is present here is a real, scriptable proxy for "SSO
 * is wired up", since we can't script the actual Entra ID hosted login UI
 * (see authenticated-journeys.spec.ts).
 */
test.describe("/api/auth/providers", () => {
  test("returns JSON including the azure-ad provider", async ({ request }) => {
    const response = await request.get("/api/auth/providers");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");

    const body = (await response.json()) as Record<string, { id?: string; type?: string }>;
    expect(body).toHaveProperty("azure-ad");
    expect(body["azure-ad"]?.id).toBe("azure-ad");
  });
});
