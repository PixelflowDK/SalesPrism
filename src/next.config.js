const withPWA = require("@ducanh2912/next-pwa").default;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // SR-014: the App Service filesystem is READ-ONLY at runtime.
  //
  // `WEBSITE_RUN_FROM_PACKAGE=1` (verified set on app-azurechat-val1, and the
  // normal configuration for zip deploy) mounts /home/site/wwwroot from the
  // package as read-only. Next's image optimizer writes optimized variants to
  // `.next/cache/images`, so every request through `next/image` produced:
  //
  //   ENOENT: no such file or directory, mkdir '/home/site/wwwroot/.next/cache'
  //
  // and — the part that actually matters — it surfaced as an
  // `unhandledRejection`, not a caught error. An unhandled rejection can
  // terminate the Node process, so this was a latent availability bug on every
  // page that renders an image, not merely log noise. Found in Application
  // Insights during the first real authenticated session on val1; it is
  // invisible to unauthenticated smoke tests because the pages that use
  // `next/image` are all behind the login.
  //
  // `unoptimized` removes the write path entirely rather than trying to make
  // the filesystem writable (which would mean giving up run-from-package, and
  // with it atomic deploys). Nothing is lost here: the two `next/image` call
  // sites are a chat image preview and the home hero, and user avatars are
  // `data:` URLs that the optimizer cannot process anyway. It also removes the
  // optimizer's server-side fetch of remote image URLs, which is one less
  // request-forgery surface.
  images: {
    unoptimized: true,
  },
  // Build provenance for /api/health (see src/app/api/health/route.ts).
  //
  // `env` INLINES these at build time, which is the entire point: they must
  // travel inside the deployed artifact. An App Service app setting can be
  // changed without redeploying, so a runtime-read value could truthfully
  // report a commit that is not the one being served — exactly the
  // "committed != deployed" confusion this is meant to make impossible.
  //
  // GITHUB_SHA is set by GitHub Actions; a local `npm run build` leaves both
  // as "unknown", and the provisioning gate treats "unknown" as a FAILURE, so
  // a locally built zip can never satisfy a provisioning run.
  env: {
    SALESPRISM_BUILD_SHA: (process.env.GITHUB_SHA || "unknown").slice(0, 7),
    SALESPRISM_BUILD_TIME: new Date().toISOString(),
  },
  // SR-003: `microsoft-cognitiveservices-speech-sdk` is now imported
  // server-side too (azure-speech.ts — transcribeAudio/synthesizeSpeech),
  // not just from client components. It ships a Node-specific websocket
  // transport (`ws`) that only loads at runtime inside its own
  // environment check (`typeof window`) — keeping it external avoids
  // webpack trying to statically bundle/analyze that branch for the
  // server build, same reasoning as `@azure/storage-blob` below.
  serverExternalPackages: ["@azure/storage-blob", "microsoft-cognitiveservices-speech-sdk"],
  // SR-010: `@azure/monitor-opentelemetry` (loaded from src/instrumentation.ts,
  // dynamically imported and gated to the Node runtime only) pulls in
  // `@opentelemetry/sdk-node`'s full optional-exporter tree — OTLP-over-gRPC
  // (`@grpc/grpc-js`), Prometheus, YAML/ajv config parsing — none of which
  // this app uses (only the Azure Monitor exporter is actually invoked), but
  // all of which `require()` Node core modules (`tls`/`net`/`zlib`/`http`)
  // that webpack cannot resolve for a bundled build.
  //
  // `serverExternalPackages` (used above for the two other Node-native
  // dependencies) does not reach this case: Next's `instrumentation.ts` entry
  // compiles through a separate webpack config from route handlers, and a
  // *dynamically* `import()`-ed package's transitive dependencies keep getting
  // traced into by webpack regardless of the serverExternalPackages list
  // (verified empirically — listing every individual offending package there
  // still left new ones surfacing one build at a time). A raw webpack
  // `externals` function, matched by request prefix rather than by an
  // exhaustive package list, is unaffected by that gap and immune to new
  // transitive dependencies appearing in a future SDK version.
  //
  // `nextRuntime !== 'edge'` is load-bearing, not `isServer` alone: Next
  // compiles THREE targets (client, Node.js server, and the Edge
  // runtime — which is what `middleware.ts` builds through), and `isServer`
  // is `true` for both the Node.js server AND the Edge target. The Edge
  // runtime has no `require()`/Node core modules at all, so telling webpack
  // to leave these packages as `commonjs` externals for that target produced
  // a middleware bundle that threw on every request needing auth — every
  // `requireAuth` route (`/chat`, `/admin`, `/customers`, `/briefs`, …)
  // started 500ing instead of redirecting unauthenticated visitors to `/`.
  // Caught live on val1 before sign-off (see docs/deployment-record.md,
  // SR-010 section) — scoping this to the Node.js target only fixes it, since
  // middleware never imports any of the matched packages itself.
  webpack: (config, { isServer, nextRuntime }) => {
    if (isServer && nextRuntime !== "edge") {
      const existing = Array.isArray(config.externals)
        ? config.externals
        : config.externals
        ? [config.externals]
        : [];
      config.externals = [
        ...existing,
        ({ request }, callback) => {
          if (
            request &&
            /^(@opentelemetry\/|@azure\/monitor-opentelemetry|@grpc\/|@js-sdsl\/|protobufjs|^yaml$|^ajv)/.test(
              request
            )
          ) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
    return config;
  },
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
