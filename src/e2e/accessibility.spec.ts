import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accessibility smoke test for the one page every visitor (authenticated or
 * not) actually reaches: the login page. Critical/serious violations fail
 * the build; moderate/minor violations are reported (attached to the test
 * result) rather than failing, so they're visible without blocking on
 * cosmetic-severity findings.
 */
test.describe("accessibility", () => {
  test("login page has zero critical/serious axe violations", async ({ page }, testInfo) => {
    await page.goto("/");

    const results = await new AxeBuilder({ page }).analyze();

    const critical = results.violations.filter((v) => v.impact === "critical");
    const serious = results.violations.filter((v) => v.impact === "serious");
    const moderateOrMinor = results.violations.filter(
      (v) => v.impact === "moderate" || v.impact === "minor"
    );

    if (moderateOrMinor.length > 0) {
      await testInfo.attach("axe-moderate-minor-violations", {
        body: JSON.stringify(
          moderateOrMinor.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.length,
          })),
          null,
          2
        ),
        contentType: "application/json",
      });
    }

    if (critical.length > 0 || serious.length > 0) {
      await testInfo.attach("axe-critical-serious-violations", {
        body: JSON.stringify(
          [...critical, ...serious].map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            helpUrl: v.helpUrl,
            nodes: v.nodes.map((n) => n.target),
          })),
          null,
          2
        ),
        contentType: "application/json",
      });
    }

    expect(critical, "critical axe violations on the login page").toEqual([]);
    expect(serious, "serious axe violations on the login page").toEqual([]);
  });
});
