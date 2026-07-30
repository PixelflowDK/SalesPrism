const withPWA = require("@ducanh2912/next-pwa").default;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["@azure/storage-blob"],
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
 *  - Everything else under `extendDefaultRuntimeCaching: true` keeps the
 *    library's default caching set: app shell/static JS/CSS, fonts and
 *    images use `StaleWhileRevalidate`; the default set also adds a
 *    `NetworkFirst` fallback for other same-origin GET `/api/*` routes,
 *    which is fine (never used for POST/streaming) — see
 *    `@ducanh2912/next-pwa`'s `defaultCache` export.
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
    runtimeCaching: [
      {
        urlPattern: ({ url }) =>
          url.pathname.startsWith("/api/chat") ||
          url.pathname.startsWith("/api/speech"),
        handler: "NetworkOnly",
        method: "GET",
      },
      {
        urlPattern: ({ url }) =>
          url.pathname.startsWith("/api/chat") ||
          url.pathname.startsWith("/api/speech"),
        handler: "NetworkOnly",
        method: "POST",
      },
    ],
  },
})(nextConfig);
