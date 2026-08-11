import { NextResponse } from "next/server";

/**
 * Deployment-health / build-provenance endpoint.
 *
 * WHY THIS EXISTS
 * ---------------
 * This codebase has twice mistaken "committed" for "deployed" and once
 * mistaken a stale service-worker cache for a live response. Both classes of
 * error are only detectable if the *running instance* can be asked, from
 * outside, which build it is actually serving. `git log` cannot answer that,
 * and neither can `az webapp show`. This route can.
 *
 * It is consumed by the post-deployment gate in
 * `.github/workflows/provision-customer.yml` ("Gate — deployed build matches
 * this run"), which fails the job if the live site is not serving the exact
 * commit the job just built. Without that gate, a zip-deploy that silently
 * lands on a stopped/failed worker reports success.
 *
 * WHY IT IS PUBLIC (deliberate, not an oversight)
 * -----------------------------------------------
 * The route is NOT listed in `src/middleware.ts`'s `config.matcher`, so
 * middleware never runs for it and no session is required. That is required
 * for the gate to work: the runner has no VNet path and no user session.
 *
 * Note the direction of `middleware.ts`'s sync rule — it warns that a path in
 * `requireAuth` but missing from `matcher` is silently UNENFORCED. Here the
 * absence is intentional and load-bearing, so do not "fix" it by adding
 * `/api/health` to the matcher; that would break the deployment gate.
 *
 * Information disclosure was considered and is negligible: Next.js already
 * publishes a per-build identifier to every anonymous visitor in its static
 * asset paths (`/_next/static/<buildId>/…`), so build-level fingerprinting is
 * available without this route. A 7-character commit SHA of a private
 * repository adds nothing an attacker can dereference. Nothing here touches a
 * datastore, reads a secret, or reflects any request input.
 *
 * The values are inlined at BUILD time via `env` in `next.config.js` — not
 * read from App Service settings at runtime. That distinction is the whole
 * point: an app setting can be changed without redeploying, so a runtime-read
 * value could report a commit that is not the one running. A build-time
 * constant travels inside the artifact and cannot lie.
 */

// Never prerender or cache this — a cached health response is a lie by
// construction, and a statically evaluated one would freeze at build time.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      // "unknown" when built outside CI (local `npm run build`); the gate
      // treats "unknown" as a failure rather than a pass, so a locally built
      // artifact can never satisfy a provisioning run.
      commit: process.env.SALESPRISM_BUILD_SHA || "unknown",
      buildTime: process.env.SALESPRISM_BUILD_TIME || "unknown",
    },
    {
      headers: {
        // Belt and braces alongside `dynamic`: stop Cloudflare, App Service's
        // ARR layer, and any intermediary from serving a previous build's
        // answer to the gate. The service worker already bypasses all of
        // `/api/*` (next.config.js), but this endpoint is also fetched by
        // curl in CI, which the service worker never sees.
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
