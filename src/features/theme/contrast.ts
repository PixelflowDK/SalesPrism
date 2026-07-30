/**
 * WCAG 2.1 color contrast — pure functions, no DOM/browser dependency.
 *
 * SR-004: added so the DESIGN.md §2/§7.3 token contrast claims (and the
 * light-mode Copper/Warm Stone body-text fix — see app/globals.css) can be
 * asserted in a fast unit test (contrast.test.ts) instead of only being
 * caught by the axe/Playwright E2E suite (e2e/accessibility.spec.ts).
 *
 * Formulas: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance and
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

function srgbChannelToLinear(channel8Bit: number): number {
  const c = channel8Bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    throw new Error(`hexToRgb expects a 6-digit hex color, got: ${hex}`);
  }
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

/** WCAG 2.1 relative luminance, 0 (black) – 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(srgbChannelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two colors, 1:1 (no contrast) – 21:1 (max). */
export function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexA);
  const luminanceB = relativeLuminance(hexB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG 2.1 SC 1.4.3 thresholds. */
export const WCAG_AA_NORMAL_TEXT = 4.5;
export const WCAG_AA_LARGE_TEXT = 3.0;
