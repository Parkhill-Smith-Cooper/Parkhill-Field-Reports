import { NextResponse } from "next/server";

import { NotAuthorizedError, authorizeProfile } from "@/lib/auth/authorize";
import { unpackRelayState } from "@/lib/auth/relayState";
import { samlProvider } from "@/lib/auth/samlClient";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  cookieOptions,
  createSessionToken,
} from "@/lib/auth/session";

/**
 * Assertion Consumer Service - where Entra ID posts the signed assertion.
 *
 * This is the security boundary of the application, so the order of checks
 * matters and each one is deliberate:
 *
 *   1. RelayState signature - proves this app started the sign-in.
 *   2. SAML signature, audience, issuer and validity window - node-saml,
 *      configured in `samlClient.ts`. Nothing is trusted before this passes.
 *   3. InResponseTo - ties the assertion to the AuthnRequest issued in step 1,
 *      so a captured assertion cannot be posted into a different login.
 *   4. Authorisation - tenant and guest rules in `authorize.ts`.
 *
 * Only then is a session cookie issued.
 *
 * Entra posts here as a cross-site form submission, so the body is
 * `application/x-www-form-urlencoded`, not JSON.
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/?error=${reason}`, origin), {
      status: 303,
      headers: { "Cache-Control": "no-store" },
    });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("bad_response");
  }

  const samlResponse = form.get("SAMLResponse");
  if (typeof samlResponse !== "string") {
    return fail("bad_response");
  }

  // 1. Did this application start the sign-in?
  const relay = await unpackRelayState(form.get("RelayState")?.toString());
  if (!relay) {
    console.warn("[ParkhillCXField] SAML response with missing or invalid RelayState");
    return fail("expired");
  }

  try {
    // 2. Is the assertion genuine, for us, and current?
    const { profile, loggedOut } = await samlProvider().validatePostResponseAsync({
      SAMLResponse: samlResponse,
    });

    if (loggedOut || !profile) {
      return fail("bad_response");
    }

    // 3. Does it answer the request we issued?
    if (profile.inResponseTo !== relay.rid) {
      console.warn(
        "[ParkhillCXField] SAML InResponseTo did not match the issued request",
      );
      return fail("expired");
    }

    // 4. Is this person allowed in?
    const user = authorizeProfile(profile);

    // 303 "See Other", not the 307 that NextResponse.redirect defaults to.
    // Entra delivers the assertion by POST, and 307 preserves the method, so
    // the browser would re-issue the redirect as a POST - and a SameSite=Lax
    // cookie is never sent on a POST, dropping the session on the very next
    // request. 303 turns the follow-up into a GET.
    const response = NextResponse.redirect(new URL(relay.returnTo, origin), {
      status: 303,
      headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(
      SESSION_COOKIE,
      await createSessionToken(user),
      cookieOptions(SESSION_MAX_AGE_SECONDS),
    );
    return response;
  } catch (error) {
    if (error instanceof NotAuthorizedError) {
      // Logged with detail, shown to the user without it.
      console.warn(`[ParkhillCXField] sign-in refused: ${error.message}`);
      return NextResponse.redirect(
        new URL(
          `/?error=not_authorized&detail=${encodeURIComponent(error.userMessage)}`,
          origin,
        ),
        { status: 303, headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("[ParkhillCXField] SAML assertion validation failed", error);
    return fail("invalid_assertion");
  }
}
