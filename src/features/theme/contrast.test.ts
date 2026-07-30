import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  relativeLuminance,
  WCAG_AA_LARGE_TEXT,
  WCAG_AA_NORMAL_TEXT,
} from "./contrast";

/**
 * SR-004 regression test.
 *
 * These hex values are copied from `app/globals.css` (`:root` / light mode
 * unless labelled "dark"). If you change a token's hex value there, update
 * it here too — this test is the thing that stops the Copper/Warm Stone
 * body-text bug (axe color-contrast, serious, on the login page) from
 * silently coming back, without needing a browser/Playwright run.
 */
const LIGHT = {
  bgWhite: "#ffffff",
  bgAi: "#f0ede6", // --color-bg-ai
  colorPrimary: "#b86a4b", // --color-primary — large-text/border/icon only
  colorPrimaryText: "#99583e", // --color-primary-text — body-copy + button-fill safe
  colorTextSecondary: "#6d6360", // --color-text-secondary (Warm Stone, darkened)
  colorTextOnPrimary: "#ffffff", // --color-text-on-primary
};

const DARK = {
  bgBase: "#111318",
  bgSurface: "#1a1d23",
  colorPrimary: "#d4856a",
  colorTextSecondary: "#a69c95",
  colorTextOnPrimary: "#1a1108",
};

describe("contrastRatio (pure WCAG 2.1 math)", () => {
  it("measures maximum contrast for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("measures no contrast for identical colors", () => {
    expect(contrastRatio("#807571", "#807571")).toBeCloseTo(1, 5);
  });

  it("is symmetric regardless of argument order", () => {
    expect(contrastRatio("#b86a4b", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#b86a4b"),
      10
    );
  });

  it("relativeLuminance is 1 for white and 0 for black", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  });
});

describe("SR-004 — light-mode body-text-safe tokens meet WCAG AA normal text (4.5:1)", () => {
  it("--color-primary-text on white passes", () => {
    expect(contrastRatio(LIGHT.colorPrimaryText, LIGHT.bgWhite)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT
    );
  });

  it("--color-primary-text on --color-bg-ai (warm sand) passes", () => {
    expect(contrastRatio(LIGHT.colorPrimaryText, LIGHT.bgAi)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT
    );
  });

  it("--color-text-secondary on white passes", () => {
    expect(
      contrastRatio(LIGHT.colorTextSecondary, LIGHT.bgWhite)
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("--color-text-secondary on --color-bg-ai (warm sand) passes", () => {
    expect(contrastRatio(LIGHT.colorTextSecondary, LIGHT.bgAi)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT
    );
  });

  it("--color-text-on-primary (white button label) on --color-primary-text (button fill) passes", () => {
    // features/ui/button.tsx default variant + meeting-brief.tsx's "Open
    // saved brief" link both fill with --color-primary-text, not raw
    // --color-primary (which only measures 4.03:1 here — see the next
    // describe block).
    expect(
      contrastRatio(LIGHT.colorTextOnPrimary, LIGHT.colorPrimaryText)
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });
});

describe("SR-004 — raw --color-primary stays large-text/border/icon only (documents the boundary)", () => {
  it("fails AA normal text (4.5:1) on white — must never be used for body copy", () => {
    const ratio = contrastRatio(LIGHT.colorPrimary, LIGHT.bgWhite);
    expect(ratio).toBeLessThan(WCAG_AA_NORMAL_TEXT);
  });

  it("fails AA normal text (4.5:1) on --color-bg-ai — must never be used for body copy", () => {
    const ratio = contrastRatio(LIGHT.colorPrimary, LIGHT.bgAi);
    expect(ratio).toBeLessThan(WCAG_AA_NORMAL_TEXT);
  });

  it("still clears AA large text (3:1) on both backgrounds — safe for headings/borders/icons", () => {
    expect(contrastRatio(LIGHT.colorPrimary, LIGHT.bgWhite)).toBeGreaterThanOrEqual(
      WCAG_AA_LARGE_TEXT
    );
    expect(contrastRatio(LIGHT.colorPrimary, LIGHT.bgAi)).toBeGreaterThanOrEqual(
      WCAG_AA_LARGE_TEXT
    );
  });
});

describe("SR-004 — dark mode was already AA-compliant (regression guard, no separate darkening needed)", () => {
  it("--color-primary (dark) on both dark backgrounds passes AA normal text", () => {
    expect(contrastRatio(DARK.colorPrimary, DARK.bgBase)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT
    );
    expect(contrastRatio(DARK.colorPrimary, DARK.bgSurface)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT
    );
  });

  it("--color-text-secondary (dark) on both dark backgrounds passes AA normal text", () => {
    expect(
      contrastRatio(DARK.colorTextSecondary, DARK.bgBase)
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(
      contrastRatio(DARK.colorTextSecondary, DARK.bgSurface)
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("--color-text-on-primary (dark) on --color-primary (dark, used as button fill) passes", () => {
    expect(
      contrastRatio(DARK.colorTextOnPrimary, DARK.colorPrimary)
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });
});
