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
];
const requireAdmin: string[] = ["/reporting", "/admin"];

export async function middleware(request: NextRequest) {
  const res = NextResponse.next();
  const pathname = request.nextUrl.pathname;

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
    "/chat/:path*",
    "/admin/:path*",
    "/customers/:path*",
    "/customers",
    "/briefs/:path*",
    "/briefs",
    "/persona/:path*",
    "/prompt/:path*",
  ],
};
