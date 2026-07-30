# DESIGN.md — Coach 360 (Sales Prism)

Design system for **Coach 360**, the AI sales-coaching product built on the Sales Prism
white-label platform. This document is the single source of truth for Claude Code /
Codex implementation sessions and for Google Stitch regeneration. Where earlier Stitch
mockups disagree with the SAD v2.7 Decisions Log (§20), **the Decisions Log wins** — see
the conflicts appendix at the end of this file.

---

## 1. Brand Overview & Principles

### 1.1 Product

Coach 360 is a B2B SaaS AI coaching assistant for Nordic enterprise sales teams. It
helps sales professionals prepare for meetings, analyse customer conversations, and
apply the Sales Coach methodology (7 interconnected models for sales excellence).

- **Target users:** Senior sales reps, sales managers, and revenue leaders at Nordic B2B
  companies. Experienced, sceptical of generic AI tools, and expect a product that
  understands their craft.
- **Platform:** Responsive web application (PWA). Desktop-first (1440px), mobile-ready
  (375px baseline).
- **Product name in UI:** **"Coach 360"** (working title, confirmed in Stitch desktop
  mockups: sidebar wordmark + "Expert Workspace" subtitle). This is the canonical name —
  see conflicts appendix re: "Nordic Coach" appearing in some mobile/marketing screens.

### 1.2 Brand Archetype

**The Mentor** — wise, structured, enabling. Not a chatbot toy; the best sales
consultant you've ever worked with, available 24/7.

### 1.3 Core Values

Clarity · Structure · Empathy · Growth

### 1.4 Design Principles

1. **Expert, not toy.** No playful illustrations, mascots, or heavy gradients. No
   glassmorphism, no generic-SaaS-template look.
2. **Editorial structure over chat convention.** Information is presented as structured
   intelligence — a document an expert wrote for you — not ephemeral chat bubbles.
3. **Nordic minimalism.** Clean, functional, sophisticated. Warm neutrals, generous
   whitespace, restrained color. Never pure-white pages — always a warm off-white base.
4. **Calm confidence.** Premium and professional, but warm and human. Avoid cold
   corporate blue, hyperbole, emoji-heavy copy, or passive language.
5. **White-label ready.** Every visual token is a CSS custom property so Enterprise
   tenants can re-skin the product while the layout and hierarchy stay fixed (see §8).
6. **Bilingual-ready tone.** Precise and structured, warm but not casual, confident
   without arrogance. Works equally in Danish and English.

### 1.5 What to Avoid

Cold corporate blue · playful illustrations or mascots · heavy gradients ·
glassmorphism · drop-shadow-heavy "floating card" SaaS aesthetics · pure white (`#FFFFFF`)
page backgrounds · chat bubbles for AI responses.

---

## 2. Color Tokens

All colors are CSS custom properties, scoped under `:root` for light mode and
`[data-theme="dark"]` (or `@media (prefers-color-scheme: dark)`, see §8) for dark mode.
This is the **finalized three-plus-neutral color system**, validated in Google Stitch
and locked in the SAD Decisions Log — it supersedes the earlier Prism Gold (`#C9A84C`)
palette and the Stitch design-system object's own draft tertiary/neutral values (see
conflicts appendix).

### 2.1 Brand Colors

| Role | Token | Light | Dark | Usage |
|---|---|---|---|---|
| Primary | `--color-primary` | `#B86A4B` Copper Fjord | `#D4856A` | Large headings (≥24px normal or ≥19px bold), decorative borders/left-accents, non-text fills/icons (WCAG SC 1.4.11, 3:1) — **never body-copy text or a solid button fill with text on top** (see §7.3) |
| Primary text (**SR-004**) | `--color-primary-text` | `#99583E` | `#D4856A` (dark mode already compliant, see §7.3) | Body-copy-sized text in the accent hue, and the solid CTA button/fill background wherever white text sits on top (`features/ui/button.tsx` default variant, `meeting-brief.tsx`'s "Open saved brief"). Measured: **5.50:1** on white, **4.70:1** on `--color-bg-ai` — both pass AA normal text. |
| Primary hover | `--color-primary-hover` | `#A05A3D` | `#E2A186` | Button/link hover & active states |
| Primary light | `--color-primary-light` | `#F5EAE5` | `#3A2A22` | Active nav background tint, subtle highlight fills |
| Secondary | `--color-secondary` | `#5E6B5B` Nordic Moss | `#8FA085` | Sidebar background, nav elements, secondary badges |
| Secondary hover | `--color-secondary-hover` | `#4C584A` | `#A3B399` | Secondary element hover |
| Tertiary | `--color-tertiary` | `#258D85` Fjord Teal | `#4FBDB3` | Coaching tips, success states, Expert Coach Insight block |
| Tertiary light | `--color-tertiary-light` | `#E8F3F2` | `#1C3532` | Tip/insight card background fill |
| Neutral | `--color-neutral` | `#807571` Warm Stone | `#A69C95` | Secondary text, muted labels, de-emphasized icons |

### 2.2 Backgrounds

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--color-bg-base` | `#F7F5F0` | `#111318` | Page/app background — warm off-white, **never pure white** |
| `--color-bg-surface` | `#FFFFFF` | `#1A1D23` | Cards, panels, modals, inputs |
| `--color-bg-sidebar` | `#FAFAF8` | `#15171C` | Sidebar (slightly warmer/darker than base — subtle tonal layer) |
| `--color-bg-ai` | `#F0EDE6` | `#2A2320` | Warm sand — AI Response Block background |
| `--color-bg-hover` | `#F0EDE6` | `#22252B` | Row/item hover background |

### 2.3 Text

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--color-text-primary` | `#20252B` Ink | `#F2EFEA` | Body text, headings, primary UI copy |
| `--color-text-secondary` (**SR-004: value corrected**) | `#6D6360` (was `#807571` raw Warm Stone) | `#A69C95` | Metadata, captions, timestamps, secondary labels. Raw Warm Stone measured **4.46:1 on white / 3.82:1 on `--color-bg-ai`** — both FAIL AA normal text (this is the exact violation axe found in `CardDescription`/`text-muted-foreground`). The darkened value measures **5.83:1 on white, 4.98:1 on `--color-bg-ai`** — both pass. `--color-neutral` (raw Warm Stone, unchanged, `#807571`/`#A69C95`) stays reserved for large text/icons/borders, mirroring `--color-primary` vs `--color-primary-text`. |
| `--color-text-muted` | `#9CA3AF` | `#6B6F76` | Disabled state, placeholder text |
| `--color-text-on-primary` | `#FFFFFF` | `#1A1108` | Text/icons on filled primary-color surfaces — pair with `--color-primary-text` for the fill, not raw `--color-primary` (see §7.3) |

### 2.4 Borders

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--color-border` | `#E2E4E0` | `#33302B` | Default dividers, input borders, card outlines |
| `--color-border-strong` | `#C8CBC5` | `#4A443D` | Secondary button outline, emphasized dividers |

### 2.5 Semantic

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--color-success` | `#1D9E75` | `#34C38F` | Success states, positive signals |
| `--color-warning` | `#EF9F27` | `#F4B255` | Warnings, medium-impact flags |
| `--color-error` | `#D85A30` | `#E8735A` | Errors, destructive actions, high-risk flags |
| `--color-info` | `#378ADD` | `#5AA6E8` | Informational banners, neutral status |

### 2.6 Spectrum Ray Colors (data visualization only)

Used **only** for module/methodology visualization, data charts, and persona/model tags
— **never** as primary UI chrome, buttons, or backgrounds. Each ray maps to one of the 7
Sales Coach methodology models.

| Token | Hex (light) | Hex (dark, lightened ~15%) | Represents |
|---|---|---|---|
| `--ray-1` | `#7F77DD` | `#9691E5` | Model 01 — 1st & 2nd Position |
| `--ray-2` | `#1D9E75` | `#3FB68F` | Model 02 — 360° Customer Understanding |
| `--ray-3` | `#378ADD` | `#5CA1E6` | Model 03 — Personas |
| `--ray-4` | `#EF9F27` | `#F3B454` | Model 04 — Value Conversation |
| `--ray-5` | `#D85A30` | `#E17A55` | Model 05 — Why–What–How–Value |
| `--ray-6` | `#D4537E` | `#DD759A` | Model 06 — Lifecycle & Partnership |
| `--ray-7` | `#6B7280` | `#868D9A` | Model 07 — Questioning Model |

### 2.7 Full CSS Block

```css
:root {
  /* Brand */
  --color-primary: #B86A4B;
  --color-primary-text: #99583E; /* SR-004 — body-copy + button-fill safe, see §7.3 */
  --color-primary-hover: #A05A3D;
  --color-primary-light: #F5EAE5;
  --color-secondary: #5E6B5B;
  --color-secondary-hover: #4C584A;
  --color-tertiary: #258D85;
  --color-tertiary-light: #E8F3F2;
  --color-neutral: #807571;

  /* Backgrounds */
  --color-bg-base: #F7F5F0;
  --color-bg-surface: #FFFFFF;
  --color-bg-sidebar: #FAFAF8;
  --color-bg-ai: #F0EDE6;
  --color-bg-hover: #F0EDE6;

  /* Text */
  --color-text-primary: #20252B;
  --color-text-secondary: #6D6360; /* SR-004 — darkened Warm Stone, see §7.3 */
  --color-text-muted: #9CA3AF;
  --color-text-on-primary: #FFFFFF;

  /* Border */
  --color-border: #E2E4E0;
  --color-border-strong: #C8CBC5;

  /* Semantic */
  --color-success: #1D9E75;
  --color-warning: #EF9F27;
  --color-error: #D85A30;
  --color-info: #378ADD;

  /* Spectrum rays — data viz only */
  --ray-1: #7F77DD;
  --ray-2: #1D9E75;
  --ray-3: #378ADD;
  --ray-4: #EF9F27;
  --ray-5: #D85A30;
  --ray-6: #D4537E;
  --ray-7: #6B7280;
}

[data-theme="dark"] {
  --color-primary: #D4856A;
  --color-primary-text: #D4856A; /* SR-004 — dark mode already clears AA, mirrors --color-primary */
  --color-primary-hover: #E2A186;
  --color-primary-light: #3A2A22;
  --color-secondary: #8FA085;
  --color-secondary-hover: #A3B399;
  --color-tertiary: #4FBDB3;
  --color-tertiary-light: #1C3532;
  --color-neutral: #A69C95;

  --color-bg-base: #111318;
  --color-bg-surface: #1A1D23;
  --color-bg-sidebar: #15171C;
  --color-bg-ai: #2A2320;
  --color-bg-hover: #22252B;

  --color-text-primary: #F2EFEA;
  --color-text-secondary: #A69C95;
  --color-text-muted: #6B6F76;
  --color-text-on-primary: #1A1108;

  --color-border: #33302B;
  --color-border-strong: #4A443D;

  --color-success: #34C38F;
  --color-warning: #F4B255;
  --color-error: #E8735A;
  --color-info: #5AA6E8;

  --ray-1: #9691E5;
  --ray-2: #3FB68F;
  --ray-3: #5CA1E6;
  --ray-4: #F3B454;
  --ray-5: #E17A55;
  --ray-6: #DD759A;
  --ray-7: #868D9A;
}
```

### 2.8 Usage Rules

- **Copper (`--color-primary`) is a heading/accent color, not a body-text color, and not
  a solid-button-fill color.** See §7.3 for the contrast analysis (**SR-004**,
  corrected) — it must be reserved for large text (≥24px normal or ≥19px bold),
  decorative borders, and non-text fills/icons (WCAG SC 1.4.11, 3:1). **Filled buttons
  with white text on top must use `--color-primary-text` instead** — raw Copper only
  measures 4.03:1 against white text, which fails the 4.5:1 normal-text threshold (the
  DESIGN.md v1 claim that this pairing was "comfortably AA-compliant" was wrong and is
  corrected here). Use `--color-primary-text` for any body-copy-sized text in the accent
  hue too.
- **Fjord Teal (`--color-tertiary`) follows the same large-text/border/icon-only rule**
  as Copper — reserved for headings, icons, left-borders, and badges on the Expert Coach
  Insight block; not for body-copy-sized text on light backgrounds. Unlike Copper, no
  dedicated `--color-tertiary-text` token exists yet (no current usage renders it at
  body size) — this is a known latent gap, flagged as a follow-up, not yet actioned as
  part of SR-004 (see §7.3).
- **Nordic Moss (`--color-secondary`)** is the sidebar/nav workhorse color — background
  tint and icon color for navigation, never the AI Response Block accent.
- **Warm Stone.** `--color-text-secondary` (**SR-004: value corrected**, see §2.3) is the
  default secondary/metadata **body** text color — timestamps, captions, disabled
  labels. `--color-neutral` (raw Warm Stone, unchanged) stays reserved for large
  text/icons/borders only, mirroring the Copper split above.
- Backgrounds are **never** pure `#FFFFFF` at the page level — only cards, inputs, and
  the sidebar-adjacent surface tier use white or near-white.
- Semantic colors (`--color-success/warning/error/info`) are reserved for system
  feedback (toasts, form validation, status badges) — not general decoration.

---

## 3. Typography

### 3.1 Font Families

```css
:root {
  --font-display: 'Playfair Display', Georgia, serif;
  --font-body: 'DM Sans', system-ui, sans-serif;
  --font-mono: 'DM Mono', 'Courier New', monospace;
}
```

| Token | Typeface | Weights | Usage |
|---|---|---|---|
| `--font-display` | Playfair Display | 400, 500, 700 | Page titles, AI Response Block section headings, module names, empty-state greetings |
| `--font-body` | DM Sans | 300, 400, 500, 700 | All UI text, chat messages, navigation labels, buttons, form fields |
| `--font-mono` | DM Mono | 400, 500 | Data values, timestamps, interaction-timeline dates, chart axes, impact-score labels |

### 3.2 next/font Loading (App Router)

Load via `next/font/google` — self-hosted, no external network request at runtime,
zero layout shift:

```typescript
// app/layout.tsx
import { Playfair_Display, DM_Sans, DM_Mono } from 'next/font/google'

const fontDisplay = Playfair_Display({ subsets: ['latin'], weight: ['400','500','700'], style: ['normal','italic'], variable: '--font-display', display: 'swap' })
const fontBody = DM_Sans({ subsets: ['latin'], weight: ['300','400','500','700'], variable: '--font-body', display: 'swap' })
const fontMono = DM_Mono({ subsets: ['latin'], weight: ['400','500'], variable: '--font-mono', display: 'swap' })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

Tailwind maps the variables to utility classes: `font-display`, `font-body`, `font-mono`.

### 3.3 Type Scale (in-product UI)

This is the practical scale used inside the Coach 360 application shell (as built in
Stitch). It differs deliberately from the Sales Prism **marketing site** hero scale
(`clamp(48px,7vw,96px)` H1 / `clamp(32px,4vw,52px)` H2) — the marketing site is a
separate surface with different typographic ambition than the dense, information-first
product UI.

| Token | Size / Line-height | Font | Usage |
|---|---|---|---|
| `--text-xs` | 11px / 1.4 | DM Sans 500 | Timestamps, metadata tags, badge text |
| `--text-sm` | 13px / 1.5 | DM Sans 500 | Sidebar labels, captions, mono data (`--font-mono` 13px for numbers) |
| `--text-base` | 15px / 1.6 | DM Sans 400 | Chat messages, AI Response Block body copy, form inputs |
| `--text-lg` | 18px / 1.5 | Playfair Display 700 | Section headings inside AI Response Block ("Strategic Context", "Recommended Questions") |
| `--text-xl` | 22px / 1.3 | DM Sans 700 | Panel titles, deal names, wizard step headings |
| `--text-2xl` | 28px / 1.2 | Playfair Display 700 | Page headings |
| `--text-3xl` | 36px / 1.1 | Playfair Display 700 | Empty-state greeting ("Good morning, Lars"), hero headings |

### 3.4 Radii, Uppercase & Letter-Spacing Rules

- `--font-mono` labels (e.g. "RELEVANT CONTEXT", "KEY STAKEHOLDER") are set uppercase
  with `letter-spacing: 0.08–0.12em` at `--text-xs`/`--text-sm`.
- Body copy in the AI Response Block never uses letter-spacing adjustments.
- Italic Playfair Display (400 italic) is reserved for quoted customer language inside
  "Recommended Questions" lists (matches the Stitch mockups' styling of quoted
  discovery-call questions).

---

## 4. Spacing, Radius & Shadow Tokens

### 4.1 Radii

Locked per SAD §11.4 and the finalized decisions log — this is the canonical scale
(supersedes the Stitch design-system object's own draft `rem`-based scale; see
conflicts appendix).

```css
:root {
  --radius-sm: 6px;    /* badges, tags, small buttons */
  --radius-md: 12px;   /* cards, inputs, panels */
  --radius-lg: 20px;   /* large cards, modal containers, bottom sheets */
  --radius-pill: 100px; /* pill buttons, persona/trait tags, badges */
}
```

### 4.2 Spacing Scale

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;   /* stack-gap — spacing between elements within a block */
  --space-5: 20px;
  --space-6: 24px;   /* gutter — spacing between layout blocks */
  --space-8: 32px;   /* container-padding — spacing between major sections */
  --space-10: 40px;
  --space-12: 48px;
}
```

- **`stack-gap` (16px):** vertical spacing between elements inside a single block (e.g.
  between an AI Response Block's heading and its body paragraph).
- **`gutter` (24px):** spacing between sibling layout blocks (e.g. between the chat
  history and the input bar).
- **`container-padding` (32px):** padding around major page sections and card interiors
  at the outermost level.

### 4.3 Shadows

Per the Stitch design system's "Elevation & Depth" guidance: hierarchy comes from
**tonal layers and 1px borders**, not shadows. Shadows are reserved for true overlays
(dropdown menus, popovers, modals) and are minimal, diffused, low-opacity.

```css
:root {
  --shadow-none: none;
  --shadow-sm: 0 1px 2px rgba(32, 37, 43, 0.04);
  --shadow-md: 0 4px 12px rgba(32, 37, 43, 0.08);   /* dropdowns, popovers */
  --shadow-lg: 0 12px 32px rgba(32, 37, 43, 0.12);  /* modals, bottom sheets */
}

[data-theme="dark"] {
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.24);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.36);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.48);
}
```

**Never** use `--shadow-*` to convey card elevation on the canvas itself (dashboard
cards, AI Response Blocks) — use `--color-bg-surface` vs `--color-bg-base` tonal
contrast and a `--color-border` outline instead. On hover, interactive cards transition
their border to `--color-primary` rather than deepening a shadow.

---

## 5. Component Specs

Observed from sampled Stitch screens: **Conversation View** (desktop),
**Empty State** (desktop), **Customer Profile — DSV Logistics** (desktop),
**Meeting Preparation Wizard** (desktop), **Mobile AI Brief Expanded**, **Mobile
Coaching View**, and **Mobile Home**.

### 5.1 Sidebar (Desktop)

- **Fixed width: 200px. Always visible. Not collapsible.** (Confirmed decision — see
  conflicts appendix re: the Stitch design-system object's draft 64px/220px
  collapse behavior, which does not match the sampled screens or the locked decision.)
- Background: `--color-bg-sidebar` (`#FAFAF8` light / `#15171C` dark) — a subtle tonal
  step warmer/darker than `--color-bg-base`.
- Structure top-to-bottom:
  1. Wordmark ("Coach 360") + "Expert Workspace" subtitle, `--font-body` 700, `--text-sm`.
  2. Primary CTA button: "New Prep Session" — filled `--color-primary`, full sidebar
     width, `--radius-md`.
  3. Primary nav: Home, Prep, Coach, People, Modules, Stats — icon (20px, Lucide) +
     label (`--text-sm`, `--font-body` 500).
  4. "Recents" section: recently-viewed customer accounts (DSV, Atea, Novo), plain text
     rows, `--text-sm`.
  5. Bottom-pinned: Settings link.
- **Active nav item:** 3px `--color-primary` left border + `--color-primary-light`
  background tint on the row. Icon and label switch to `--color-primary` / `--color-text-primary` 700.
- **Inactive nav item:** icon + label in `--color-text-secondary`; hover background
  `--color-bg-hover`.
- Sidebar never scrolls independently from a collapsed state — it is a fixed-width
  column for the lifetime of the desktop session.

### 5.2 Top Bar (Deal Context)

- Left: current deal/customer name as a small eyebrow label ("Deal Intelligence") with
  the deal identity line below (e.g. "● Atea – Cloud Infrastructure Renewal").
- Center-left: **tab group** — `Context` / `Timeline` / `Insights`. Active tab:
  `--color-primary` text + 2px bottom border in `--color-primary`. Inactive tab:
  `--color-text-secondary`, no border. `--font-body` 500, `--text-sm`.
- Right: global search icon, notification bell, help icon, user avatar + name/role
  (e.g. "Lars Jansen — Enterprise Lead").
- Height: 64px. Background `--color-bg-surface`, bottom border `--color-border`.
- On mobile, the top bar collapses to logo + search only (see §6.2).

### 5.3 AI Response Block (Signature Component)

The product's visual signature. **Must not resemble a chat bubble.** Renders as a
structured, scannable document card.

```
┌─────────────────────────────────────────────────────┐
│ background: var(--color-bg-ai)          #F0EDE6      │
│ border-left: 3px solid var(--color-primary)          │
│ border-radius: var(--radius-md)                      │
│ padding: var(--space-5) var(--space-6)                │
│                                                       │
│  [icon] Meeting Brief — DSV Logistics         [•••]  │  ← --font-body 700, --text-lg
│  ─────────────────────────────────────────────────   │
│                                                       │
│  Strategic Context                                    │  ← --font-display 700, --text-lg, color: var(--color-primary)
│  Body copy in --font-body, --text-base, --color-text-primary
│                                                       │
│  Recommended Questions                                │  ← --font-display 700, --text-lg, color: var(--color-primary)
│  01. "Quoted discovery-call question…" (italic)       │
│                                                       │
│  ┌──────────────────┐  ┌──────────────────┐          │
│  │ RISK & GOVERNANCE │  │ OPERATIONAL SPEED │          │  ← value-area mini-cards
│  │ ●●●●○  High Impact│  │ ●●●○○  Med Impact │          │
│  └──────────────────┘  └──────────────────┘          │
│                                                       │
│  [Save Brief]  [Generate Email]  [Start Roleplay]     │
└─────────────────────────────────────────────────────┘
```

**Anatomy rules:**

- **Container:** `--color-bg-ai` background, 3px solid `--color-primary` left border
  only (no border on other sides), `--radius-md` corners, `--space-5`/`--space-6`
  padding.
- **Section headings** ("Strategic Context", "Recommended Questions", "Value Areas",
  "Next Steps"): `--font-display` 700, `--text-lg` (18px), color **`--color-primary`**
  (copper) — this applies uniformly to every section heading in the block (locked
  decision; see conflicts appendix re: inconsistent teal-vs-copper rendering observed
  across sampled Stitch screens).
- **Body copy:** `--font-body` 400, `--text-base` (15px), `--color-text-primary`.
  **Never render body copy in `--color-primary` or `--color-tertiary`** (contrast — see
  §7.3).
- **Quoted questions:** italic Playfair Display, prefixed with a `--font-mono` numeral
  (`01.`, `02.`) in `--color-error`-adjacent copper-red accent.
- **Value-area mini-cards:** small bordered cards (`--color-border`, `--radius-sm`)
  containing a `--font-mono` uppercase label, a 5-segment dot meter (filled dots in
  `--color-primary`, empty dots in `--color-border-strong`), and an impact label
  ("High/Medium/Low Impact") in `--font-mono` `--text-xs`.
  large modules/methodology charts may substitute the ray colors (§2.6) per model.
- **Action row:** bottom-aligned button group — one primary filled button (e.g. "Save
  Brief" or "Prepare next meeting") + one or two secondary outline buttons ("Generate
  Email", "Start Roleplay" / "Email Draft", "Roleplay Prep" on mobile). Never more than
  3 actions in the row.
- **Entrance animation:** fade-in + `translateY(8px → 0)`, 300ms ease-out (see §6.4).
- **Nested "Expert Coach Insight" callouts** (e.g. the Meeting Prep Wizard's "Coaching
  Tip" panel) use the same left-border card pattern but in **`--color-tertiary`** (Fjord
  Teal) instead of copper, per the locked decision — reserved for coaching tips and
  success-oriented guidance, distinct from the primary AI Response Block.

### 5.4 Chat Input

- **Persistent input (active conversation):** white/`--color-bg-surface` background,
  1px `--color-border`, `--radius-lg`, full-width within the workspace column.
  Placeholder: **"Ask Sales Coach…"** — the tone is the coach, not a generic AI.
  Right-aligned mic icon (`--color-text-secondary`) + filled circular send button
  (`--color-primary` background, white arrow icon).
- **Empty-state hero input:** visually larger variant of the same component, centered
  under the greeting, placeholder **"Or ask me anything…"** — softer copy appropriate
  to a first-touch, non-deal-scoped entry point. Functionally identical component;
  copy differs by context.
- Voice input (mic icon) is a first-class, always-visible affordance — not tucked into
  an overflow menu. STT audio is proxied through a Next.js API route to Azure AI Speech
  (EU datacenter) per the GDPR architecture — never sent client-side to a third-party
  STT provider.

### 5.5 Buttons

| Variant | Style | Usage |
|---|---|---|
| Primary | `--color-primary-text` fill (**SR-004: corrected from `--color-primary`** — raw Copper only measures 4.03:1 with white text, see §7.3), `--color-text-on-primary` text, `--radius-md`, `--font-body` 700 | Main CTA per view/block (Save, Continue, Prepare next meeting) |
| Secondary | Transparent fill, `--color-border-strong` 1px outline, `--color-text-primary` text | Supporting actions (Back, Export Brief, Generate Email) |
| Tertiary / Ghost | No border, `--color-text-secondary` text | Low-emphasis inline actions (helpful/regenerate feedback row) |
| Destructive | `--color-error` fill or outline | Delete/remove actions only |
| Icon button | 40×40px hit area, `--color-text-secondary` default, `--color-primary` on hover/active | Notification bell, help, overflow (•••) |

- Minimum touch target 44×44px on all interactive controls regardless of visual size
  (see §7.1).
- Hover: primary buttons darken to `--color-primary-hover`; secondary buttons gain a
  `--color-bg-hover` fill.
- Disabled: 40% opacity, no hover transition, `cursor: not-allowed`.

### 5.6 Cards

- **Action cards (empty state):** large clickable blocks — icon (24px, tinted chip
  background), bold title (`--font-body` 700, `--text-base`), muted description
  (`--color-text-secondary`, `--text-sm`). Background `--color-bg-surface`, border
  `--color-border`. On hover: `transform: scale(1.02)`, border transitions to
  `--color-primary`, 150ms ease.
- **Stakeholder cards:** avatar (32–40px circle) + name + role, a persona pill tag
  (`--radius-pill`, colored per persona type), a trigger/risk pill tag when relevant,
  and a "View full profile →" link in `--color-primary`.
- **Stat cards:** compact 2-up cards showing a single metric label (`--font-mono`
  uppercase, `--text-xs`) and value (`--text-xl` or `--font-mono` for numeric data).
- **Interaction Timeline:** table-like list — date column in `--font-mono`, event type,
  a one-line AI-generated outcome summary, small avatar/icon. Rows separated by
  `--color-border` hairlines, no zebra striping.

### 5.7 Badges & Tags

| Type | Style |
|---|---|
| Account tier badge (e.g. "ENTERPRISE ACCOUNT") | `--color-secondary` (Nordic Moss) fill, white/cream uppercase text, `--radius-pill`, `--text-xs` |
| Persona tag (e.g. "Tactical Persona", "Strategic Persona") | Tinted pill using the relevant ray color (§2.6) at ~15% opacity fill + full-opacity text, `--radius-pill` |
| Risk/trigger tag (e.g. "Risk Aversion") | `--color-error`-tinted pill, `--radius-pill`, `--text-xs` |
| Impact/status dot meter | 5-segment dot row, filled = `--color-primary`, empty = `--color-border-strong` |

### 5.8 Empty, Loading, Streaming & Error States

- **Empty state (first login / no active deal):** Large Playfair Display greeting
  ("Good morning, {name}") in `--color-primary`, `--text-3xl`, sub-heading in
  `--color-text-secondary`. A 2×2 grid of action cards (§5.6): "Prepare a meeting", "Get
  coaching", "Update a customer", "Explore a module". Hero input below the grid. A
  trust microcopy line beneath the input: *"Your data stays within your organisation."*
  A subtle decorative watermark icon (outlined, low-opacity) anchors the bottom-right of
  the canvas — never load-bearing content, purely atmospheric branding.
- **Loading state:** Use a lightweight SVG loader (LDRS `dotWave` or similar), slow
  speed, `--color-primary` tint — never a generic spinner. Skeleton loaders for cards
  use `--color-bg-hover` shimmer blocks matching the final card's `--radius-md`.
- **Streaming state (AI Response Block mid-generation):** The block renders
  progressively — heading and container appear first (fade-in per §6.4), body text
  streams token-by-token via the Vercel AI SDK `streamText`/`toDataStreamResponse`
  pipeline. A subtle pulsing cursor or `--color-primary` low-opacity shimmer on the
  currently-writing line communicates "still generating." Action buttons
  (Save/Email/Roleplay) are disabled/hidden until streaming completes.
- **Error state:** Inline card with `--color-error` left border (same anatomy as the AI
  Response Block, but red instead of copper/teal), a plain-language message, and a
  "Try again" secondary button. Never show raw error codes or stack traces to end users.

---

## 6. Layout Grid

### 6.1 Desktop (1440px baseline) — Two-Column Workspace

```
┌──────────┬──────────────────────────────────────────────┐
│ SIDEBAR  │ MAIN WORKSPACE                                │
│ 200px    │                                                │
│ fixed    │  Top bar — 64px (deal name + Context/Timeline/ │
│          │  Insights tabs + search/bell/avatar)           │
│ Coach360 │  ──────────────────────────────────────────    │
│ Expert   │                                                │
│ Workspace│  Content column — max-width ~880px, centered   │
│          │  within remaining space, container-padding 32px│
│ [+ New   │                                                │
│  Prep    │  Chat history (scrollable)                     │
│  Session]│    User message                                │
│          │    AI Response Block                           │
│ ○ Home   │                                                │
│ ○ Prep   │  ──────────────────────────────────────────    │
│ ○ Coach  │  Persistent chat input bar                     │
│ ○ People │                                                │
│ ○ Modules│                                                │
│ ○ Stats  │                                                │
│          │                                                │
│ Recents  │                                                │
│  DSV     │                                                │
│  Atea    │                                                │
│  Novo    │                                                │
│          │                                                │
│ Settings │                                                │
└──────────┴──────────────────────────────────────────────┘
```

- Sidebar: **200px fixed, always visible, never collapsible** (locked decision).
- Some detail/profile views (Customer Profile, Meeting Prep Wizard) add a **third
  column** on the right (280–320px) for contextual panels — Active Initiatives, AI
  Coaching Summary, Coaching Tip / Relevant Context, Workspace Tools. This right rail is
  optional per-view, not a persistent global layout element.
- Grid gutter: `--space-6` (24px) between major blocks; `--space-4` (16px) within a
  block's internal stack.

### 6.2 Mobile (375px baseline) — Bottom Navigation

```
┌──────────────────┐
│ Coach 360   [👤]  │  Top bar — logo + avatar only (64px)
├──────────────────┤
│                  │
│  Chat / content  │
│  scrolls here    │
│                  │
├──────────────────┤
│ [Input ...]  🎤  │  Persistent input, full width
├──────────────────┤
│ 🏠  💬  📋 👤 ⋯ │  Bottom tab bar — Home / Coach / Prep / People / More
└──────────────────┘
```

- 5 destinations max in the bottom tab bar; overflow into a "More" tab.
- Top bar simplifies to logo + search/avatar only — no deal-context tabs (those move
  inline into the page content on mobile, or into the bottom-sheet header — see below).
- **AI Brief as bottom sheet:** On mobile, the AI Response Block is presented as a
  **modal bottom sheet** — rounded top corners (`--radius-lg`), drag handle affordance,
  swipe-to-dismiss. Internal anatomy (copper left border, Playfair headings, action row)
  is unchanged from the desktop card; only the container chrome differs.
- Minimum content width 375px; fluid up to tablet breakpoint (768px) where the layout
  reverts to a constrained single-column version of the desktop workspace (no sidebar).

### 6.3 Breakpoints

```css
--bp-mobile: 375px;   /* baseline */
--bp-tablet: 768px;   /* single-column desktop layout, no sidebar */
--bp-desktop: 1024px; /* sidebar appears */
--bp-wide: 1440px;    /* full three-column layout available */
```

### 6.4 Motion

| Interaction | Duration / Easing |
|---|---|
| AI Response Block entrance | fade-in + `translateY(8px → 0)`, 300ms ease-out |
| Action card hover | `scale(1.02)`, 150ms ease, border→`--color-primary` |
| Button state change | 120ms ease |
| Bottom sheet open/close | 250ms ease-out (translateY), backdrop fade 200ms |
| Sidebar (desktop) | static — no expand/collapse transition, it is fixed-width |

All durations respect `prefers-reduced-motion` (§7.2).

---

## 7. Accessibility Rules

### 7.1 Touch Targets & Interaction

- **Minimum 44×44px** touch target on every interactive control on mobile viewports,
  regardless of the visual icon/button size (pad with invisible hit-area if needed).
- All icon-only buttons (bell, help, overflow, mic, send) carry an `aria-label`.
- Focus states are visible on every interactive element: 2px `--color-primary` outline
  with 2px offset, never `outline: none` without a replacement.
- Semantic HTML5 landmarks required: `<nav>` for sidebar/bottom tab bar, `<main>` for
  the workspace column, `<aside>` for contextual right-rail panels.

### 7.2 Motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Applies globally — including the AI Response Block entrance animation and bottom-sheet
transitions, which must become instant (no fade/translate) under this preference.

### 7.3 Color Contrast

**SR-004 (this section corrected/expanded)** — axe (via `e2e/accessibility.spec.ts`,
`@axe-core/playwright`) found 3 serious WCAG AA `color-contrast` violations on the login
page, all traced to raw Copper/Warm Stone being used at body/button-label size. Every
ratio below is computed with the WCAG 2.1 relative-luminance formula (see
`src/features/theme/contrast.ts`, exercised by `src/features/theme/contrast.test.ts` —
a pure-function unit test with no browser, so this cannot regress silently) — not
eyeballed.

| Foreground | Background | Ratio | AA normal text (4.5:1) | AA large text (3:1) |
|---|---|---|---|---|
| Copper `#B86A4B` | White `#FFFFFF` | 4.03:1 | Fail | **Pass** |
| Copper `#B86A4B` | Warm sand `#F0EDE6` | 3.45:1 | Fail | **Pass** |
| White `#FFFFFF` (button label) | Copper `#B86A4B` (raw fill) | 4.03:1 | **Fail** | Pass |
| **Primary text `#99583E`** (**new, SR-004**) | White `#FFFFFF` | **5.50:1** | **Pass** | Pass |
| **Primary text `#99583E`** (**new, SR-004**) | Warm sand `#F0EDE6` | **4.70:1** | **Pass** | Pass |
| White `#FFFFFF` (button label) | **Primary text `#99583E`** (fill, **SR-004**) | **5.50:1** | **Pass** | Pass |
| Fjord Teal `#258D85` | White `#FFFFFF` | 4.02:1 | Fail | **Pass** |
| Fjord Teal `#258D85` | Warm sand `#F0EDE6` | 3.44:1 | Fail | **Pass** |
| Nordic Moss `#5E6B5B` | White `#FFFFFF` | 5.63:1 | **Pass** | Pass |
| Ink `#20252B` | Warm off-white `#F7F5F0` | 14.16:1 | **Pass** | Pass |
| Warm Stone `#807571` (raw, `--color-neutral`) | White `#FFFFFF` | 4.47:1 | **Fail** | Pass |
| Warm Stone `#807571` (raw, `--color-neutral`) | Warm sand `#F0EDE6` | 3.82:1 | Fail | Pass |
| **Text secondary `#6D6360`** (**darkened, SR-004**) | White `#FFFFFF` | **5.83:1** | **Pass** | Pass |
| **Text secondary `#6D6360`** (**darkened, SR-004**) | Warm sand `#F0EDE6` | **4.98:1** | **Pass** | Pass |

**Rule (corrected, SR-004):** WCAG large text is **≥18pt (24px) at normal weight, or
≥14pt (~19px) bold** — the previous "≥18px, or ≥14px bold" wording in this section was
itself wrong (conflated pt/px) and partly caused the bug: several components used Copper
at sizes that only *looked* like the documented "large text" case but never reached the
real threshold. Copper and Fjord Teal meet AA only at that real large-text size — e.g.
the AI Response Block's `--text-lg`/700-weight section headings (§5.3, a locked, signature
design decision, deliberately exempted here) — and as decorative borders/non-text
icons (WCAG SC 1.4.11, 3:1, already comfortably cleared).

- **`#B86A4B` (`--color-primary`) must never be used for body copy or for a solid
  button/link-style fill with text on top — use `--color-primary-text` (`#99583E`)
  instead** for both cases. This single rule fixes all 3 axe violations: the login
  page's `CardTitle` wordmark (body-size Copper text), the `GitHub`/`Microsoft 365`
  button labels (white text on a raw-Copper fill), and — by the same pattern —
  `meeting-brief.tsx`'s "Open saved brief" link.
- **Warm Stone must never be used for body copy via `--color-neutral` directly** — use
  `--color-text-secondary` (now `#6D6360`, corrected from raw `#807571`) instead, which
  is exactly what `text-muted-foreground` already resolves to across the app (no
  per-component sweep needed for this one — see `app/globals.css`).
- Fjord Teal has the same large-text-only restriction as Copper but no dedicated
  body-text-safe token yet exists (`--color-tertiary` has no `-text` variant) — flagged
  as a follow-up, since no current usage renders it at body size (unlike Copper, which
  did, on the login page).
- `src/features/auth-page/login.tsx` is off-limits/read-only for this fix. Its
  `CardTitle` wordmark span could not be edited directly, so the fix lives in
  `app/globals.css` as a narrowly-scoped selector (`h3 span.text-primary`) targeting the
  one DOM shape unique to that call site, rather than in the component itself — see the
  comment above that rule in `app/globals.css` for the full reasoning.

### 7.4 Additional Rules

- Never convey state through color alone — the impact dot-meter (§5.3) pairs color with
  a text label ("High/Medium/Low Impact"); risk tags pair color with a text description.
- Dark mode is a first-class mode, not an afterthought — every component spec in §5 must
  be verified against the dark tokens in §2, not just the light set.
- Form inputs (search, chat input, wizard fields) always carry a visible label or
  `aria-label`, even when a placeholder is present.
- Streaming AI content must be announced to assistive technology via an `aria-live="polite"`
  region so screen reader users aren't left waiting silently.

---

## 8. White-Label Theming Contract

White-label re-skinning is an **Enterprise-tier-only** feature (`whiteLabel: boolean` on
the `TenantTheme` document in Cosmos DB). SMB/Professional-tier customers always run the
standard Coach 360 theme defined in §2–§4 above.

### 8.1 Mechanism

All values in §2 (color), §3 (font families), and §4 (radius) are CSS custom properties
set at `:root` and re-emitted per-tenant at runtime — no rebuild required. The Next.js
app reads the active tenant's `TenantTheme` document (resolved from the request
hostname/slug) and injects an inline `<style>` block (or a `[data-tenant]` attribute
selector) overriding the subset of tokens the tenant has customized.

```typescript
// Pseudocode — tenant theme injection
const theme = await getTenantTheme(tenantSlug)
// theme = { colorPrimary: '#1A4D8F', fontDisplay: 'Fraunces', ... } (Enterprise only)
```

```css
[data-tenant="acme-corp"] {
  --color-primary: #1A4D8F;
  --font-display: 'Fraunces', Georgia, serif;
}
```

### 8.2 Overridable Tokens (Enterprise tier)

| Category | Overridable? | Notes |
|---|---|---|
| `--color-primary`, `--color-primary-hover`, `--color-primary-light`, `--color-primary-text` | ✅ Yes | Tenant brand color replaces Copper Fjord entirely. **SR-004:** any tenant override must ship its own `--color-primary-text` too (a body-text/button-fill-safe darkened variant of the tenant's own hue, ≥4.5:1 against both white and the AI-block background) — the §8.3 theming-editor contrast guardrail should validate this pair, not just the raw `--color-primary` vs backgrounds. |
| `--color-secondary` | ✅ Yes | Optional — tenants may keep Nordic Moss default |
| `--color-tertiary` | ⚠️ Limited | Tenants may retint, but the AI Response Block's document-block anatomy (border-left + warm-sand-family background) must remain — only the hue may shift |
| `--color-bg-ai` | ⚠️ Limited | Must remain a warm neutral distinct from `--color-bg-base`; cannot become pure white or a saturated brand color |
| `--font-display`, `--font-body` | ✅ Yes | Tenant may substitute their own brand typefaces (loaded via `next/font` or self-hosted) |
| `--font-mono` | ❌ No | DM Mono is fixed — used for data/metadata consistency across all tenants |
| `--radius-sm/md/lg/pill` | ✅ Yes | Tenant may adjust roundness (e.g. sharper corners for a more corporate brand) |
| `--ray-1` … `--ray-7` | ❌ No | Fixed — spectrum colors map to the 7 Sales Coach methodology models and must stay consistent across all tenants for training/reference-material continuity |
| Layout (sidebar width, tab structure, AI Response Block anatomy) | ❌ No | Structural — never themeable, only colors/type/radius are |
| Logo | ✅ Yes | Tenant logo replaces the Coach 360 wordmark in the sidebar |
| Dark mode token set | ✅ Yes (paired) | Any light-mode override must ship with a corresponding `[data-theme="dark"]` value — tenants cannot opt out of dark mode support |

### 8.3 Guardrails

- The theming editor (admin portal, Enterprise tier) validates any submitted color pair
  against the §7.3 contrast rules before allowing publish — a tenant primary color that
  fails AA-large-text against both white and their chosen AI-block background is
  rejected with an inline warning.
- SMB/Professional tenants see `whiteLabel: false` and the theme editor UI is hidden
  entirely — they always render the tokens in §2.7 unmodified.
- The AI Response Block's core identity (warm-neutral background + primary-color
  left-border + Playfair-Display-style section headings) is the product's signature and
  is deliberately **not** fully themeable — a tenant can change the color, not the
  document-block concept itself.

---

## Appendix: Stitch Screens Sampled & Conflict Resolutions

**Project:** "Sales Coaching Conversation View" (Stitch project id `18108853848392918680`, DESKTOP, ~35 assets/screens)

**Screens sampled (screenshots inspected directly):**

| Screen | Stitch screen id |
|---|---|
| Conversation View (desktop) | `85c39bcc4ebc4a8a9d9b22c2f1b5184c` |
| Empty State (desktop) | `463cd036734c4573a77ddbd72119b0b2` |
| Customer Profile — DSV Logistics (desktop) | `c8ca55efc3984f32bb6c78cd9ca0be75` |
| Meeting Preparation Wizard (desktop) | `7491121719c34247bf4f8a03493194ca` |
| Mobile AI Brief Expanded | `d4ac33ce1632442e93648e6ad088cb8f` |
| Mobile Coaching View | `d7deb3b849c2406499cf89c4dd296741` |
| Mobile Home | `05a38b7c01c44efc9dbc885ab3529523` |

Also inspected: the project's Stitch **design system object** ("Nordic Sales
Excellence") via `list_design_systems`, which embeds its own `DESIGN.md` draft.

**Conflicts found (Decisions Log wins in every case, per instructions):**

1. **Sidebar behavior.** Stitch's design-system object claims a "64px icon-only bar,
   expands to 220px" — but the sampled screenshots show a permanently expanded, labeled
   ~200px sidebar with no collapsed state, matching the Decisions Log's "Always visible
   (200px) — not collapsible." **Resolution: fixed 200px, non-collapsible.**
2. **AI Response Block heading color.** "Meeting Prep Wizard" and "Mobile Coaching View"
   render both "Strategic Context" and "Recommended Questions" in copper; "Mobile AI
   Brief Expanded" renders "Recommended Questions" in teal instead. The Decisions Log
   states both headings render in copper. **Resolution: all section headings copper**;
   teal reserved for the separate Expert Coach Insight callout.
3. **Product name.** Desktop screens show **"Coach 360."** Mobile screens (Mobile Home,
   Mobile Coaching View, Mobile AI Brief sender label) show **"Nordic Coach"** instead —
   an apparent stale working title. **Resolution: "Coach 360"** per the Decisions Log.
4. **Tertiary color value.** Stitch's palette defines `fjord-teal: #4D7C7A`; the
   Decisions Log finalizes Fjord Teal as **`#258D85`**. **Resolution: `#258D85`.**
5. **Neutral/secondary-text value.** Stitch uses `slate: #5E6A72`; the Decisions Log
   introduces Warm Stone **`#807571`** instead, absent from the Stitch object.
   **Resolution: `#807571`** is canonical; Slate is superseded.
6. **Base background hex.** Stitch renders the app background as `#F4F5F2` ("Mist
   Gray"); the brief and SAD §11.2 specify the `#F7F5F0`-family as canonical.
   **Resolution: `#F7F5F0`**; `#F4F5F2` noted here in case pixel-parity with the
   specific mockups is later required.
7. **Radius scale.** Stitch's object uses `rem` units (0.25/0.5/0.75/1/1.5rem + full);
   the brief and SAD §11.4 specify `6/12/20/100px`. **Resolution: `6/12/20/100px`.**

No conflicts were found regarding: the Copper Fjord primary hex, the document-block
(non-chat-bubble) AI Response Block concept, the Context/Timeline/Insights top-bar tab
structure, the "Ask Sales Coach…" persistent chat-input placeholder, the Playfair
Display / DM Sans / DM Mono type family assignments, or the 7 spectrum ray colors — all
matched cleanly across both sources.
