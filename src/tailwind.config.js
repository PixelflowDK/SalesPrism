/** @type {import('tailwindcss').Config} */
// Colors, radii and shadows are wired to the DESIGN.md CSS custom
// properties (see src/app/globals.css) rather than hardcoded values, so
// that light/dark mode and Enterprise white-label overrides (injected at
// runtime by TenantThemeStyle) apply with zero rebuild. See
// docs/Frontend_Teknologi_Reference.md §3.
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./features/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      screens: {},
    },
    extend: {
      colors: {
        border: "var(--color-border)",
        "border-strong": "var(--color-border-strong)",
        input: "var(--color-border)",
        ring: "var(--color-primary)",
        background: "var(--color-bg-base)",
        foreground: "var(--color-text-primary)",
        sidebar: "var(--color-bg-sidebar)",
        ai: "var(--color-bg-ai)",
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          light: "var(--color-primary-light)",
          foreground: "var(--color-text-on-primary)",
          // SR-004 — WCAG AA contrast fix. `bg-primary-text` / `text-primary-text`:
          // the body-copy- and button-fill-safe darker Copper (DESIGN.md §7.3 /
          // src/app/globals.css). `text-primary` itself is unchanged and stays
          // reserved for large headings (>=24px normal or >=19px bold),
          // decorative borders, and non-text fills/icons.
          text: "var(--color-primary-text)",
        },
        secondary: {
          DEFAULT: "var(--color-secondary)",
          hover: "var(--color-secondary-hover)",
          foreground: "var(--color-text-on-primary)",
        },
        tertiary: {
          DEFAULT: "var(--color-tertiary)",
          light: "var(--color-tertiary-light)",
          foreground: "var(--color-text-on-primary)",
        },
        neutral: "var(--color-neutral)",
        destructive: {
          DEFAULT: "var(--color-error)",
          foreground: "var(--color-text-on-primary)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          foreground: "var(--color-text-on-primary)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          foreground: "var(--color-text-on-primary)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          foreground: "var(--color-text-on-primary)",
        },
        muted: {
          DEFAULT: "var(--color-bg-hover)",
          foreground: "var(--color-text-secondary)",
        },
        accent: {
          DEFAULT: "var(--color-bg-hover)",
          foreground: "var(--color-text-primary)",
        },
        popover: {
          DEFAULT: "var(--color-bg-surface)",
          foreground: "var(--color-text-primary)",
        },
        card: {
          DEFAULT: "var(--color-bg-surface)",
          foreground: "var(--color-text-primary)",
        },
        ray: {
          1: "var(--ray-1)",
          2: "var(--ray-2)",
          3: "var(--ray-3)",
          4: "var(--ray-4)",
          5: "var(--ray-5)",
          6: "var(--ray-6)",
          7: "var(--ray-7)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "Courier New", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        none: "var(--shadow-none)",
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      // @tailwindcss/typography prose colors piped through the same design
      // tokens as everything else, so `.prose` content (chat message
      // markdown) adapts to dark mode / white-label overrides automatically
      // without needing a separate `dark:prose-invert` class.
      typography: {
        DEFAULT: {
          css: {
            "--tw-prose-body": "var(--color-text-primary)",
            "--tw-prose-headings": "var(--color-text-primary)",
            "--tw-prose-lead": "var(--color-text-secondary)",
            "--tw-prose-links": "var(--color-primary)",
            "--tw-prose-bold": "var(--color-text-primary)",
            "--tw-prose-counters": "var(--color-text-secondary)",
            "--tw-prose-bullets": "var(--color-border-strong)",
            "--tw-prose-hr": "var(--color-border)",
            "--tw-prose-quotes": "var(--color-text-primary)",
            "--tw-prose-quote-borders": "var(--color-border-strong)",
            "--tw-prose-captions": "var(--color-text-secondary)",
            "--tw-prose-code": "var(--color-text-primary)",
            "--tw-prose-pre-code": "var(--color-text-primary)",
            "--tw-prose-pre-bg": "var(--color-bg-hover)",
            "--tw-prose-th-borders": "var(--color-border)",
            "--tw-prose-td-borders": "var(--color-border)",
          },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};
