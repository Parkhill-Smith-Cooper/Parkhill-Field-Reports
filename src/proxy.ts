import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, readSessionToken } from "@/lib/auth/session";

/**
 * The single gate in front of the application.
 *
 * Access control lives here rather than in each page and route handler,
 * because "protected unless explicitly listed as public" is the only
 * arrangement that stays correct when someone adds a route later and forgets
 * to think about authentication.
 *
 * This is Next 16's `proxy` convention - the former `middleware.ts`, which is
 * deprecated. It runs on the Edge runtime, which is why the session is
 * verified with `jose` rather than Node crypto, and why nothing here imports
 * the SAML library (that only runs in the route handlers).
 */

/** Reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = new Set([
  "/", // the sign-in landing page
  "/api/saml/login",
  "/api/saml/acs",
  "/api/saml/logout",
  "/api/saml/metadata",
]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const session = await readSessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (session) {
    return NextResponse.next();
  }

  // An unauthenticated API call gets a status code, not a redirect to an HTML
  // page: the client service layer parses `{ error }` from the body and would
  // otherwise report a JSON parse failure instead of "please sign in".
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Your session has expired. Sign in again to continue." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Send the engineer to sign in, remembering where they were headed so they
  // land back on it rather than on a generic home page.
  const signIn = new URL("/", request.url);
  signIn.searchParams.set("returnTo", `${pathname}${search}`);
  return NextResponse.redirect(signIn);
}

export const config = {
  // Everything except Next's own assets and the logo. The logo is excluded by
  // name so it still renders on the sign-in page, where the visitor is by
  // definition not yet authenticated.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|parkhill-logo.svg).*)"],
};
