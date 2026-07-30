# Frontend-teknologi
## Generel referencearkitektur — Next.js, React, CSS og komponenter

---

## Formål

Dette dokument beskriver en moderne, produktionsklar frontend-stack til 
B2B SaaS-applikationer i 2026. Stacken er produktagnostisk og kan genbruges 
i ethvert webprojekt med tilsvarende krav til performance, vedligeholdelse 
og brugeroplevelse.

---

## 1. Grundlæggende framework — Next.js

### Hvad det er

Next.js er et React-baseret framework der tilføjer struktur, routing, 
server-side rendering og en lang række produktions-features oven på React.

### Hvorfor Next.js frem for "rent" React

| Funktion | Rent React | Next.js |
|---|---|---|
| Routing | Skal tilføjes separat (React Router) | Indbygget — filsystem-baseret |
| Server-rendering | Skal konfigureres manuelt | Indbygget — flere rendering-strategier |
| API-endpoints | Separat backend nødvendig | Indbygget — Route Handlers |
| Billede-optimering | Manuel | Indbygget (`next/image`) |
| Code-splitting | Manuel konfiguration | Automatisk |

### App Router (Next.js 13+)

Den moderne måde at strukturere en Next.js-applikation. Mapper og filer 
i `app/`-mappen definerer automatisk ruter:

```
app/
├── page.tsx                    → forsiden (/)
├── layout.tsx                  → delt layout for alle sider
├── chat/
│   ├── page.tsx                → /chat
│   └── [id]/page.tsx            → /chat/123 (dynamisk rute)
├── admin/
│   ├── page.tsx                → /admin
│   └── users/page.tsx           → /admin/users
└── api/
    └── chat/route.ts            → API-endpoint på /api/chat
```

**Server Components vs Client Components:**
```typescript
// Server Component (standard) — kører kun på serveren
// Bruges til: datahentning, statisk indhold, SEO-vigtigt indhold
export default async function Page() {
  const data = await fetchFromDatabase()
  return <div>{data}</div>
}

// Client Component — kører i browseren
// Bruges til: interaktivitet, useState, onClick, animationer
'use client'
export default function Button() {
  const [clicked, setClicked] = useState(false)
  return <button onClick={() => setClicked(true)}>Klik</button>
}
```

Tommelfingerregel: brug Server Components som standard, og tilføj kun 
`'use client'` når komponenten faktisk har brug for browser-interaktivitet.

---

## 2. Sprog — TypeScript

TypeScript er JavaScript med et typesystem ovenpå. Det fanger fejl ved 
kompilering i stedet for ved runtime hos brugeren.

```typescript
// JavaScript — fejl opdages først når koden køres
function getUserName(user) {
  return user.name.toUpperCase()
}

// TypeScript — fejl opdages allerede i editoren
interface User {
  name: string
  email: string
}
function getUserName(user: User): string {
  return user.name.toUpperCase()
}
```

I et team-projekt eller et projekt der skal vedligeholdes over tid er 
TypeScript stort set altid den rigtige beslutning — den ekstra tid det 
tager at skrive typer betaler sig hurtigt tilbage i færre fejl og bedre 
editor-support (autocomplete, refactoring).

---

## 3. Styling — Tailwind CSS

### Hvad det er

Et "utility-first" CSS-framework. I stedet for at skrive egne CSS-klasser, 
komponerer man styling direkte i HTML/JSX via prædefinerede utility-klasser.

```html
<!-- Traditionel CSS -->
<div class="card">Indhold</div>
<style>
  .card {
    background: white;
    border-radius: 8px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
</style>

<!-- Tailwind -->
<div class="bg-white rounded-lg p-6 shadow-sm">Indhold</div>
```

### Fordele

- Ingen separate CSS-filer at holde styr på
- Ingen "døde" CSS-klasser der aldrig bliver fjernet
- Konsistent design — alle bruger samme spacing-skala, samme farve-palette
- Hurtig iteration — styling ændres direkte i komponenten

### CSS Custom Properties til design-tokens

Tailwind kombineres typisk med CSS custom properties for ting der skal 
kunne ændres dynamisk (f.eks. ved white-label eller dark mode):

```css
:root {
  --color-primary: #B86A4B;
  --color-background: #F4F5F2;
  --font-display: 'Playfair Display', serif;
}

[data-theme="dark"] {
  --color-primary: #D4856A;
  --color-background: #111318;
}
```

```html
<div class="bg-[var(--color-background)] text-[var(--color-primary)]">
  Indhold der automatisk skifter ved tema-ændring
</div>
```

Dette giver mulighed for runtime-temaskift uden at skulle rebuilde 
applikationen — relevant for white-label produkter eller dark/light mode.

---

## 4. Komponentbibliotek — shadcn/ui

### Hvad det er

shadcn/ui er ikke et traditionelt komponentbibliotek man installerer 
som en pakke. Det er en samling af færdige, tilgængelige komponenter 
bygget på Radix UI primitives og styled med Tailwind — som man kopierer 
direkte ind i sit eget projekt.

```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add dropdown-menu
```

Dette opretter faktiske kode-filer i dit projekt (`components/ui/button.tsx`) 
som du frit kan redigere — i modsætning til et npm-package hvor du er 
låst til bibliotekets API.

### Hvorfor denne tilgang

| | Traditionelt bibliotek (f.eks. Material UI) | shadcn/ui |
|---|---|---|
| Kode-ejerskab | Pakke — kan ikke redigeres direkte | Din egen kode — fuld kontrol |
| Bundle size | Hele biblioteket, selv ubrugte dele | Kun de komponenter du faktisk bruger |
| Styling-frihed | Begrænset til biblioteks-API | Fuld Tailwind-frihed |
| Opdateringer | Kan bryde ved version-skift | Du styrer selv opdateringer |

### Radix UI — fundamentet under shadcn/ui

Radix UI leverer de "unstyled" tilgængelige primitives — dropdown-logik, 
fokus-håndtering, keyboard-navigation, ARIA-attributter — uden nogen visuel 
styling. shadcn/ui tilføjer Tailwind-styling oven på Radix's solide 
tilgængelighedsfundament.

```typescript
// Eksempel: en Radix-baseret Dialog der er tilgængelig out-of-the-box
import * as Dialog from '@radix-ui/react-dialog'

<Dialog.Root>
  <Dialog.Trigger>Åbn</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      {/* Fokus-trap, Escape-luk, ARIA-roller er automatisk håndteret */}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

---

## 5. AI/Chat-specifik UI — assistant-ui

For applikationer med chat-interfaces er `assistant-ui` et relevant 
komponentbibliotek specifikt designet til AI chat-oplevelser — streaming 
beskeder, markdown-rendering, kode-highlighting i AI-svar, og lignende.

Ligesom shadcn/ui leveres det typisk som ejet kildekode i projektet 
(`components/assistant-ui/`) frem for en låst dependency, så det kan 
tilpasses fuldt ud til produktets specifikke behov (f.eks. dokumentblok-stil 
AI-svar i stedet for traditionelle chat-bobler).

---

## 6. State management og data-hentning

### Til simpel UI-state

React's indbyggede `useState` og `useReducer` er ofte tilstrækkeligt:

```typescript
const [isOpen, setIsOpen] = useState(false)
```

### Til server-data

Med Next.js App Router hentes data ofte direkte i Server Components 
uden behov for et separat state-management bibliotek:

```typescript
// Ingen Redux, ingen useEffect — bare async/await direkte i komponenten
export default async function CustomerPage({ params }) {
  const customer = await db.getCustomer(params.id)
  return <CustomerProfile data={customer} />
}
```

For mere komplekse klient-side data-synkroniseringsbehov (caching, 
revalidering, optimistiske opdateringer) bruges typisk **TanStack Query** 
(tidligere React Query) eller **SWR**.

---

## 7. Ikoner

**Lucide React** er et udbredt valg — et omfattende, let ikonbibliotek 
med konsistent stil, designet specifikt til React:

```typescript
import { Search, Bell, Settings } from 'lucide-react'

<Search className="w-5 h-5 text-gray-500" />
```

---

## 8. Animation

### CSS-baseret (foretrukket til simple overgange)

```css
.fade-in {
  animation: fadeIn 300ms ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### Framer Motion (til komplekse animationer)

Bruges når man har brug for gestus-baserede interaktioner, layout-animationer, 
eller komplekse enter/exit-sekvenser:

```typescript
import { motion } from 'framer-motion'

<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  Indhold
</motion.div>
```

### Loading-indikatorer

Til simple loading-spinners/states bruges ofte lette, dedikerede 
animationsbiblioteker (f.eks. LDRS) i stedet for tunge afhængigheder — 
disse leverer SVG-baserede animationer optimeret til performance.

```bash
npm install ldrs
```

### Tilgængelighed — reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 9. Progressive Web App (PWA)

Til mobile-klare web-applikationer uden behov for native app-udvikling:

```bash
npm install @ducanh2912/next-pwa
```

```typescript
// next.config.ts
import withPWA from '@ducanh2912/next-pwa'

export default withPWA({
  dest: 'public',
  register: true,
})(nextConfig)
```

Dette giver installation til hjemmeskærm, offline-cache af statiske assets, 
og mulighed for push-notifikationer — uden separate iOS/Android-codebaser.

**Vigtig overvejelse:** Service worker bør konfigureres til `network-only` 
strategi for streaming-endpoints (f.eks. AI chat-responses), så delvist 
cachede streams ikke vises forkert.

---

## 10. Typografi

Typisk indlæst via Google Fonts med `next/font` for optimal performance 
(fonten bundles og selv-hostes automatisk, ingen ekstern netværkskald):

```typescript
import { Playfair_Display, DM_Sans } from 'next/font/google'

const display = Playfair_Display({ subsets: ['latin'], variable: '--font-display' })
const body = DM_Sans({ subsets: ['latin'], variable: '--font-body' })
```

---

## 11. Formularer og validering

**React Hook Form** kombineret med **Zod** til skemavalidering er et 
udbredt og robust mønster:

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
})

const form = useForm({
  resolver: zodResolver(schema)
})
```

Zod-skemaer kan desuden genbruges til at validere data fra AI-modeller 
(strukturerede outputs) og API-requests — ét skema, flere anvendelser.

---

## 12. Samlet teknologi-stack — typisk opsætning

```
Framework:        Next.js (App Router)
Sprog:             TypeScript
Styling:           Tailwind CSS + CSS custom properties
Komponenter:       shadcn/ui (Radix UI fundament)
Ikoner:            Lucide React
Animation:         CSS transitions + Framer Motion (komplekse cases)
Loading-states:    LDRS eller lignende letvægts-bibliotek
Formularer:        React Hook Form + Zod
Fonte:             next/font (Google Fonts, selv-hostet)
PWA:               @ducanh2912/next-pwa
Data-fetching:     Native async/await i Server Components,
                   TanStack Query til klient-side synkronisering
```

---

## 13. Designprincipper — generelt anvendelige

Uafhængigt af specifikt produkt er følgende principper værd at bevare:

- **Server Components som standard** — kun `'use client'` ved faktisk behov
- **Design-tokens som CSS custom properties** — muliggør runtime-temaskift
- **Ejet komponent-kildekode frem for låste pakker** — for kritiske UI-dele
- **Minimum 44×44px touch-targets** på mobile interaktive elementer
- **`prefers-reduced-motion` respekteres altid**
- **Semantiske HTML5-landmarks** (`<nav>`, `<main>`, `<aside>`) for tilgængelighed
- **ARIA-attributter på alle icon-only knapper** (`aria-label`)

---

*Dette er en generel referencearkitektur for moderne frontend-udvikling 
med Next.js og React. Stacken er produktagnostisk og kan anvendes i 
ethvert webprojekt med tilsvarende krav til performance, tilgængelighed 
og vedligeholdelse.*
