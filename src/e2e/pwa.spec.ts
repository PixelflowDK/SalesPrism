import { expect, test } from "@playwright/test";

/**
 * PWA installability smoke checks — `next-pwa` (next.config.js) only
 * registers a service worker for a PRODUCTION build (`disable:
 * process.env.NODE_ENV === "development"`), which is exactly why
 * playwright.config.ts's local `webServer` runs `next build && next start`
 * rather than `next dev` — against `next dev` the `sw.js` assertion below
 * would legitimately 404 and that would NOT indicate a real bug.
 */
test.describe("PWA", () => {
  test("/manifest.json is served with the expected name and icon set", async ({ request }) => {
    const response = await request.get("/manifest.json");
    expect(response.status()).toBe(200);

    const manifest = (await response.json()) as {
      name?: string;
      short_name?: string;
      icons?: Array<{ src: string; sizes: string; type: string }>;
    };

    expect(manifest.name).toBe("Coach 360");
    expect(manifest.short_name).toBe("Coach 360");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons?.length).toBeGreaterThan(0);

    for (const icon of manifest.icons ?? []) {
      expect(icon.src).toMatch(/^\/icons\/.+/);
      expect(icon.sizes).toMatch(/^\d+x\d+$/);
      expect(icon.type).toBe("image/png");
    }
  });

  test("the service worker file is reachable in a production build", async ({ request }) => {
    const response = await request.get("/sw.js");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/javascript/);
  });
});
