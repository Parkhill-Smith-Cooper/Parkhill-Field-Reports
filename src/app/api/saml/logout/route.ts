import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { samlProvider } from "@/lib/auth/samlClient";
import {
  SESSION_COOKIE,
  cookieOptions,
  readSessionToken,
} from "@/lib/auth/session";

/**
 * Signs the engineer out.
 *
 * The local session cookie is always cleared first, so pressing Sign out ends
 * the session in this application even if the round trip to Entra fails. If a
 * single-logout URL is configured, the browser is then handed to Entra so the
 * Microsoft session ends too - without that, the next sign-in would complete
 * silently and look like the sign-out never happened.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const store = await cookies();
  const session = await readSessionToken(store.get(SESSION_COOKIE)?.value);

  let destination = new URL("/?signed_out=1", origin).toString();

  if (session && process.env.SAML_LOGOUT_URL) {
    try {
      destination = await samlProvider().getLogoutUrlAsync(
        {
          nameID: session.nameId,
          nameIDFormat: session.nameIdFormat ?? "",
          issuer: process.env.SAML_IDP_ISSUER ?? "",
          sessionIndex: session.sessionIndex,
        },
        "",
        {},
      );
    } catch (error) {
      // Falling back to a local sign-out is strictly better than leaving the
      // engineer signed in because Entra could not be reached.
      console.error(
        "[ParkhillCXField] could not build the single logout request",
        error,
      );
    }
  }

  // 303 for the same reason as the ACS route: Entra may POST here for
  // IdP-initiated logout, and 307 would preserve the method.
  const response = NextResponse.redirect(destination, {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
  // maxAge 0 expires the cookie immediately.
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  return response;
}

/** Entra can also POST here for IdP-initiated logout. */
export const POST = GET;
