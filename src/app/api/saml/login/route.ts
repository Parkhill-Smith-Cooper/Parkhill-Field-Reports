import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { packRelayState, safeReturnTo } from "@/lib/auth/relayState";
import { samlProvider } from "@/lib/auth/samlClient";

/**
 * Starts sign-in: builds a SAML AuthnRequest and redirects to Entra ID.
 *
 * The request id is generated here rather than left to node-saml, so it can be
 * signed into RelayState and checked against the assertion's `InResponseTo`
 * when the engineer comes back. See `src/lib/auth/relayState.ts`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));

  try {
    // A SAML ID is an XML ID, which may not begin with a digit.
    const requestId = `_${randomUUID()}`;
    const relayState = await packRelayState({ rid: requestId, returnTo });

    const redirectUrl = await samlProvider({ requestId }).getAuthorizeUrlAsync(
      relayState,
      undefined,
      {},
    );

    // `no-store` so a browser or proxy never replays a stale AuthnRequest.
    return NextResponse.redirect(redirectUrl, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[ParkhillCXField] SAML login could not be started", error);
    const message =
      error instanceof Error &&
      error.message.startsWith("Missing required environment variable")
        ? "not_configured"
        : "login_failed";
    return NextResponse.redirect(new URL(`/?error=${message}`, url.origin));
  }
}
