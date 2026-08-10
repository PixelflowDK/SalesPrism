const withPWA = require("@ducanh2912/next-pwa").default;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // SR-003: `microsoft-cognitiveservices-speech-sdk` is now imported
  // server-side too (azure-speech.ts — transcribeAudio/synthesizeSpeech),
  // not just from client components. It ships a Node-specific websocket
  // transport (`ws`) that only loads at runtime inside its own
  // environment check (`typeof window`) — keeping it external avoids
  // webpack trying to statically bundle/analyze that branch for the
  // server build, same reasoning as `@azure/storage-blob` below.
  serverExternalPackages: ["@azure/storage-blob", "microsoft-cognitiveservices-speech-sdk"],
};

/**
 * PWA — SAD v2.7 §18 Phase F / docs/Frontend_Teknologi_Reference.md §9.
 *
 * Service worker strategy:
 *  - `/api/chat` and any other streaming Route Handler (currently just
 *    `/api/chat` — see chat-handler.ts `streamText().toUIMessageStreamResponse()`)
 *    MUST bypass the service worker entirely. This custom rule is placed
 *    BEFORE the library defaults (via `runtimeCaching`) so it wins the
 *    Workbox route match; `NetworkOnly` never touches the Cache Storage
 *    API, so a partially-streamed or aborted response can never be
 *    replayed from cache on a later request/reload — a cached partial
 *    stream would corrupt the chat UX. `/api/speech/*` (token issuance +
 *    STT cleanup, both short-lived/non-idempotent) bypasses for the same
 *    reason.
 *  - **NO same-origin `/api/*` route is ever cached.** An earlier version of
 *    this config carved out only `/api/chat` and `/api/speech` and reasoned
 *    that the library's `NetworkFirst` fallback for other `/api/*` GETs was
 *    "fine". It was not. `@ducanh2912/next-pwa`'s `defaultCache` registers
 *    every same-origin `/api/*` GET except `/api/auth/callback` into a
 *    `NetworkFirst` cache named `apis` with `maxAgeSeconds: 86400`. That
 *    swallowed **`GET /api/auth/csrf`**: `signIn()` fetches the CSRF token
 *    before POSTing, so a cached 24-hour-old token was replayed, the POST
 *    failed CSRF validation, and `signIn()` resolved without a redirect URL —
 *    the button spun forever and never navigated to Entra. Diagnosed live on
 *    val1 2026-08-10. Auth handshakes are inherently single-use; caching any
 *    part of one is a correctness bug, and caching per-user API responses is
 *    also a privacy concern. Hence one blanket `NetworkOnly` rule for `/api/*`
 *    rather than an allow-list that must be maintained per new route.
 *  - Everything else under `extendDefaultRuntimeCaching: true` keeps the
 *    library's default caching set for genuinely static assets: app shell,
 *    static JS/CSS, fonts and images via `StaleWhileRevalidate`.
 *  - `cleanupOutdatedCaches` removes precaches from superseded builds so a
 *    deployment cannot leave a client serving a previous build's assets.
 *  - Disabled in `next dev` (`disable`) — a service worker intercepting
 *    HMR/Fast Refresh requests during local development would serve stale
 *    JS and mask real changes.
 */
module.exports = withPWA({
  dest: "public",
  register: true,
  disable: process.env.NODE_ENV === "development",
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      // NEVER cache ANY same-origin API route. See the doc block above for why
      // the previous "only /api/chat and /api/speech" carve-out was wrong.
      // One rule, no exceptions: there is no API route here whose response is
      // worth caching, and several where caching is actively harmful
      // (auth handshakes, streaming, per-user data). A blanket rule also means
      // a newly added route is safe by default rather than silently inheriting
      // the library's NetworkFirst cache.
      {
        urlPattern: ({ url, sameOrigin }) =>
          sameOrigin && url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
        method: "GET",
      },
      {
        urlPattern: ({ url, sameOrigin }) =>
          sameOrigin && url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
        method: "POST",
      },
    ],
  },
})(nextConfig);
