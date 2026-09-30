import { SignJWT, jwtVerify } from "jose";

/**
 * The signed session cookie.
 *
 * The app is its own SAML service provider, so it owns its sessions rather
 * than delegating to an auth library. The session is a signed JWT in an
 * HttpOnly cookie - deliberately stateless, so it needs no session store and
 * keeps working when App Service scales out to more than one instance.
 *
 * `jose` is used rather than `jsonwebtoken` because this module is also
 * imported by `src/middleware.ts`, which runs on the Edge runtime where Node's
 * crypto APIs are not available.
 */

export const SESSION_COOKIE = "cxfield_session";

/** Long enough for a full day in the field, short enough to be re-verified. */
const SESSION_TTL = "10h";

/** Everything the app needs to know about the signed-in engineer. */
export type SessionUser = {
  /** Entra object id - stable, and what `createdBy` records. */
  sub: string;
  /** User principal name. */
  upn: string;
  email: string;
  name: string;
  /** Entra tenant id, re-checked on every request. */
  tid: string;
  /** Retained so single logout can be sent back to Entra correctly. */
  nameId: string;
  nameIdFormat?: string;
  sessionIndex?: string;
};

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "Missing or too-short SESSION_SECRET. It signs the session cookie and " +
        "must be at least 32 characters. Generate one with " +
        '`node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"` ' +
        "and see the \"Authentication\" section of the README.",
    );
  }
  return new TextEncoder().encode(value);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret());
}

/** Returns the session, or `null` for anything unreadable, tampered or expired. */
export async function readSessionToken(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (
      typeof payload.sub !== "string" ||
      typeof payload.upn !== "string" ||
      typeof payload.tid !== "string"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      upn: payload.upn,
      email: typeof payload.email === "string" ? payload.email : payload.upn,
      name: typeof payload.name === "string" ? payload.name : payload.upn,
      tid: payload.tid,
      nameId: typeof payload.nameId === "string" ? payload.nameId : payload.upn,
      nameIdFormat:
        typeof payload.nameIdFormat === "string" ? payload.nameIdFormat : undefined,
      sessionIndex:
        typeof payload.sessionIndex === "string" ? payload.sessionIndex : undefined,
    };
  } catch {
    // Bad signature, expired, or malformed - all mean "not signed in".
    return null;
  }
}

/** Cookie attributes shared by the session and the transient login cookie. */
export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // Off in local development, where there is no HTTPS.
    secure: process.env.NODE_ENV === "production",
    // `lax` rather than `strict`: the browser arrives at the app through a
    // top-level redirect from Entra after sign-in, and `strict` would withhold
    // the cookie on that first navigation.
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export const SESSION_MAX_AGE_SECONDS = 10 * 60 * 60;
