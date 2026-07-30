import { FC } from "react";
import { TenantTheme } from "./tenant-theme";

/**
 * Enterprise white-label CSS injection (DESIGN.md §8, SAD §10.2).
 *
 * Renders a plain `<style>` tag overriding the subset of design tokens an
 * Enterprise tenant has customized. SMB/Professional tenants
 * (`whiteLabel: false`) render nothing — they always get the standard
 * Sales Prism tokens baked into globals.css.
 *
 * Deliberately NOT wrapped in a Tailwind `@layer` — un-layered rules
 * always win the CSS cascade over `@layer base` rules regardless of DOM
 * position, so this override is guaranteed to beat the platform defaults
 * without depending on where in the document it's rendered.
 *
 * Tenant color/font values come from Cosmos DB, ultimately populated via
 * the Enterprise admin theme editor (SAD §10.2, DESIGN.md §8.3 — validated
 * for AA contrast there before publish). They are still untrusted input
 * from this render path's point of view, so every value is sanitized
 * before being interpolated into raw CSS text.
 */
export const TenantThemeStyle: FC<{ tenantTheme: TenantTheme | null }> = ({
  tenantTheme,
}) => {
  if (!tenantTheme || !tenantTheme.whiteLabel || !tenantTheme.theme) {
    return null;
  }

  const { theme, darkMode } = tenantTheme;

  const lightDeclarations = [
    cssColorDeclaration("--color-primary", theme.primary),
    cssColorDeclaration("--color-bg-base", theme.background),
    cssColorDeclaration("--color-text-primary", theme.foreground),
    cssFontDeclaration("--font-display", theme.fontDisplay),
    cssFontDeclaration("--font-body", theme.fontBody),
  ]
    .filter(Boolean)
    .join("\n      ");

  const darkDeclarations = darkMode
    ? [
        cssColorDeclaration("--color-primary", darkMode.primary),
        cssColorDeclaration("--color-bg-base", darkMode.background),
        cssColorDeclaration("--color-text-primary", darkMode.foreground),
      ]
        .filter(Boolean)
        .join("\n      ")
    : "";

  const css = `:root {
      ${lightDeclarations}
    }
    ${darkDeclarations ? `[data-theme="dark"] {\n      ${darkDeclarations}\n    }` : ""}`;

  return (
    <style
      id="tenant-theme-override"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: css }}
    />
  );
};

/** Accepts `#rgb`, `#rrggbb`, `#rrggbbaa` only — rejects anything else. */
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Font-family lists only: letters, digits, spaces, commas, quotes, hyphens. */
const FONT_FAMILY_PATTERN = /^[a-zA-Z0-9 ,'"\-]+$/;

const cssColorDeclaration = (property: string, value: string): string => {
  if (!HEX_COLOR_PATTERN.test(value.trim())) return "";
  return `${property}: ${value.trim()};`;
};

const cssFontDeclaration = (property: string, value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return "";
  if (!FONT_FAMILY_PATTERN.test(trimmed)) return "";
  return `${property}: ${trimmed};`;
};
