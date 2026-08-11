import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

// IMPORTANT: every entry here must ALSO appear in `config.matcher` below.
// Middleware only executes for paths the matcher selects — an entry present
// here but absent there is silently unenforced. That gap previously left
// /customers, /briefs, /persona and /prompt without an auth check, so an
// anonymous request reached server code that throws on the missing session
// (a 500 instead of a login redirect). Caught by the E2E access-control spec;
// keep the two lists in sync.
const requireAuth: string[] = [
  "/chat",
  "/api",
  "/reporting",
  "/unauthorized",
  "/persona",
  "/prompt",
  "/admin",
  "/customers",
  "/briefs",
  // W1/W2/W3/W4/W6 (feature-to-ui-audit.md) — new Coach 360 product-layer
  // routes. Every entry here MUST also appear in `config.matcher` below, per
  // the doc-comment above: an entry present here but absent there is
  // silently unenforced (see the /customers etc. 500-instead-of-redirect
  // history this file's comment documents).
  "/home",
  "/prepare",
  "/coach",
  "/modules",
  "/documents",
];
// "/admin" already covers the `/admin/*` UI. "/api/admin" is listed
// separately because it does NOT start with "/admin" as a string prefix
// (it starts with "/api") — without this entry, `/api/admin/...` routes
// would pass the `requireAuth` session check (via the "/api" entry above)
// but skip the admin-role check here, relying solely on each route's own
// `requireAdminContext()` call. Defense in depth: keep both.
const requireAdmin: string[] = ["/reporting", "/admin", "/api/admin"];

/**
 * NextAuth cookies whose values are bound to NEXTAUTH_SECRET. When that secret is
 * rotated, any cookie a browser still holds becomes permanently unverifiable.
 * Both the `__Secure-`/`__Host-` prefixed and unprefixed spellings are listed because
 * the prefix depends on the deployment's URL scheme, and a browser can end up holding
 * BOTH after an environment changes — in which case clearing only one leaves the stale
 * one still being sent.
 */
const NEXT_AUTH_COOKIES = [
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export async function middleware(request: NextRequest) {
  const res = NextResponse.next();
  const pathname = request.nextUrl.pathname;

  /**
   * Self-heal a stale CSRF cookie instead of dead-ending the user.
   *
   * When NEXTAUTH_SECRET is rotated, a browser holding the previous csrf cookie fails
   * NextAuth's CSRF check. NextAuth answers the sign-in POST with a 302 back to
   * `/api/auth/signin?csrf=true`; the client-side `signIn()` helper follows that by
   * assigning window.location, so the page simply re-renders and the button appears
   * to do nothing — no error, no progress, indefinitely, because the offending cookie
   * is never cleared. Observed live on val1 after the SD-003 rotation.
   *
   * Clearing the bound cookies here turns a permanent dead end into a single retry:
   * the next request gets a freshly issued csrf token. This weakens no security
   * property — expired/unverifiable cookies carry no authority, and the CSRF check
   * itself still runs on every sign-in.
   */
  if (pathname === "/api/auth/signin" && request.nextUrl.searchParams.get("csrf") === "true") {
    /**
     * Reassessed 2026-08-10 (docs/reviews/csrf-selfheal-reassessment.md) once the
     * real cause of the val1 dead-end turned out to be the service worker caching
     * `GET /api/auth/csrf` for 24h (fixed in dc9eb8e), not this cookie.
     *
     * RETAINED because it is the only mitigation for one failure class the
     * NetworkOnly fix does not cover: a browser holding BOTH the prefixed and
     * unprefixed csrf cookie. A fresh `Set-Cookie` replaces only the same-named
     * cookie, so the other keeps being sent and NextAuth may keep reading the
     * stale one. Clearing both names is the only way out.
     *
     * MASKING RISK, deliberately mitigated by the log below: for a PERSISTENT
     * misconfiguration (e.g. NEXTAUTH_URL host/scheme mismatch so the cookie is
     * never returned at all) this would otherwise present as an invisible
     * click -> bounce -> click loop with nothing recorded anywhere. For the
     * transient classes it is designed for, it resolves in ONE retry — so a
     * repeated firing means the cause is NOT transient and must be investigated.
     * Codes only; never cookie or token values.
     */
    console.error(
      JSON.stringify({
        code: "auth.csrf.self-heal-fired",
        note: "CSRF validation failed; clearing secret-bound cookies. Repeated occurrences indicate a persistent misconfiguration, not a stale cookie.",
      })
    );
    const healed = NextResponse.redirect(new URL("/", request.url));
    for (const name of NEXT_AUTH_COOKIES) {
      healed.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
    return healed;
  }

  if (requireAuth.some((path) => pathname.startsWith(path))) {
    const token = await getToken({
      req: request,
    });

    //check not logged in
    if (!token) {
      const url = new URL(`/`, request.url);
      return NextResponse.redirect(url);
    }

    if (requireAdmin.some((path) => pathname.startsWith(path))) {
      //check if not authorized
      if (!token.isAdmin) {
        const url = new URL(`/unauthorized`, request.url);
        return NextResponse.rewrite(url);
      }
    }
  }

  return res;
}

// note that middleware is not applied to api/auth as this is required to logon (i.e. requires anon access)
export const config = {
  matcher: [
    "/unauthorized/:path*",
    "/reporting/:path*",
    "/api/chat/:path*",
    "/api/chat",
    "/api/images/:path*",
    "/api/speech/:path*",
    "/api/sales-coach/:path*",
    "/api/admin/:path*",
    "/chat/:path*",
    "/admin/:path*",
    "/customers/:path*",
    "/customers",
    "/briefs/:path*",
    "/briefs",
    "/persona/:path*",
    "/prompt/:path*",
    "/home/:path*",
    "/home",
    "/prepare/:path*",
    "/prepare",
    "/coach/:path*",
    "/coach",
    "/modules/:path*",
    "/modules",
    "/documents/:path*",
    "/documents",
    // Auth routes are otherwise deliberately excluded (anon access is required to log
    // on). This ONE path is included solely for the stale-CSRF self-heal above — it
    // adds no auth check and cannot gate sign-in.
    "/api/auth/signin",
  ],
};
