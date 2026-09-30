import "server-only";

import { SignJWT, jwtVerify } from "jose";

/**
 * RelayState: the login request's proof of origin.
 *
 * SAML echoes `RelayState` back from the identity provider untouched, so the
 * app signs its own token into it. On the way back, a valid signature proves
 * the sign-in was started by this application rather than injected by someone
 * else, and the embedded request id lets the ACS route confirm the assertion
 * answers the exact AuthnRequest that was issued.
 *
 * This is what a transient cookie would normally do. A cookie cannot be used
 * here: the identity provider returns the user by cross-site POST, and a
 * `SameSite=Lax` cookie is withheld on exactly that request. `SameSite=None`
 * would work but requires HTTPS, which would make local development
 * impossible. RelayState has neither problem.
 */

/** Long enough to type a password and pass MFA, short enough to be useless later. */
const RELAY_TTL = "15m";

export type RelayState = {
  /** The AuthnRequest id this login expects a response to. */
  rid: string;
  /** Where to send the engineer once signed in. */
  returnTo: string;
};

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "Missing or too-short SESSION_SECRET (at least 32 characters). See the " +
        '"Authentication" section of the README.',
    );
  }
  return new TextEncoder().encode(value);
}

export async function packRelayState(state: RelayState): Promise<string> {
  return new SignJWT({ ...state })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(RELAY_TTL)
    .sign(secret());
}

export async function unpackRelayState(
  value: string | undefined | null,
): Promise<RelayState | null> {
  if (!value) return null;
  try {
    const { payload } = await jwtVerify(value, secret());
    if (typeof payload.rid !== "string") return null;
    return {
      rid: payload.rid,
      returnTo:
        typeof payload.returnTo === "string" ? payload.returnTo : "/projects",
    };
  } catch {
    return null;
  }
}

/**
 * Only same-origin paths are accepted as a post-login destination, so a
 * crafted link cannot use the sign-in flow to bounce someone to another site.
 */
export function safeReturnTo(candidate: string | null | undefined): string {
  if (!candidate) return "/projects";
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/projects";
  return candidate;
}
