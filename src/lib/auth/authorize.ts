import "server-only";

import type { Profile } from "@node-saml/node-saml";

import type { SessionUser } from "./session";

/**
 * Turning a SAML assertion into an authorised Parkhill engineer.
 *
 * This is the file that decides who gets in, so the rules are written out
 * explicitly rather than spread across the callback route.
 */

/** The claim URIs Microsoft Entra ID emits in a SAML assertion. */
const CLAIM = {
  tenantId: "http://schemas.microsoft.com/identity/claims/tenantid",
  objectId: "http://schemas.microsoft.com/identity/claims/objectidentifier",
  displayName: "http://schemas.microsoft.com/identity/claims/displayname",
  upn: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
  email: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  givenName: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
  surname: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
} as const;

/**
 * Entra stamps `#EXT#` into the user principal name of every B2B guest -
 * an account invited into the tenant from outside, such as a contractor or a
 * vendor. Guests satisfy a tenant check, because they really are in the
 * Parkhill tenant, which is why the tenant id alone does not mean "Parkhill
 * staff".
 */
const GUEST_UPN_MARKER = "#EXT#";

export class NotAuthorizedError extends Error {
  /** Safe to show the user; says why without leaking assertion detail. */
  readonly userMessage: string;

  constructor(userMessage: string, detail?: string) {
    super(detail ? `${userMessage} (${detail})` : userMessage);
    this.name = "NotAuthorizedError";
    this.userMessage = userMessage;
  }
}

function claim(profile: Profile, uri: string): string | undefined {
  const value = profile[uri];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function domainOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const at = value.lastIndexOf("@");
  return at === -1 ? undefined : value.slice(at + 1).toLowerCase();
}

/** Optional extra restriction, comma-separated, e.g. "parkhill.com,parkhill.net". */
function allowedDomains(): string[] {
  return (process.env.SAML_ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
}

/**
 * Validates a SAML assertion against the access rules and returns the session
 * to issue. Throws `NotAuthorizedError` for anyone who should not be let in.
 */
export function authorizeProfile(profile: Profile): SessionUser {
  const expectedTenant = process.env.PARKHILL_TENANT_ID;
  if (!expectedTenant) {
    throw new Error(
      "Missing required environment variable PARKHILL_TENANT_ID. It is what " +
        "restricts sign-in to the Parkhill tenant, so the app refuses to " +
        'authenticate anyone without it - see "Authentication" in the README.',
    );
  }

  const tenantId = claim(profile, CLAIM.tenantId);
  const upn = claim(profile, CLAIM.upn) ?? profile.nameID;
  const email = claim(profile, CLAIM.email) ?? upn;
  const objectId = claim(profile, CLAIM.objectId);

  // 1. The assertion must come from the Parkhill tenant. Entra will only ever
  //    issue for the tenant the app is registered in, but this is checked
  //    anyway: it is the one claim that must never be assumed.
  if (!tenantId) {
    throw new NotAuthorizedError(
      "Your sign-in did not include a tenant, so it could not be verified.",
      "tenantid claim missing - enable it on the enterprise application",
    );
  }
  if (tenantId.toLowerCase() !== expectedTenant.toLowerCase()) {
    throw new NotAuthorizedError(
      "This application is only available to Parkhill accounts.",
      `unexpected tenant ${tenantId}`,
    );
  }

  // 2. Reject guests. See GUEST_UPN_MARKER above for why the tenant check
  //    does not already cover this.
  if (!upn) {
    throw new NotAuthorizedError(
      "Your sign-in did not include a username, so it could not be verified.",
      "neither the name claim nor NameID was present",
    );
  }
  if (upn.toUpperCase().includes(GUEST_UPN_MARKER)) {
    throw new NotAuthorizedError(
      "Guest accounts cannot use this application. Sign in with your Parkhill account.",
      `guest UPN ${upn}`,
    );
  }

  // 3. Optional domain allow-list, for tenants that host more than one
  //    organisation's staff.
  const domains = allowedDomains();
  if (domains.length > 0) {
    const domain = domainOf(upn) ?? domainOf(email);
    if (!domain || !domains.includes(domain)) {
      throw new NotAuthorizedError(
        "This application is only available to Parkhill accounts.",
        `domain ${domain ?? "unknown"} is not in SAML_ALLOWED_EMAIL_DOMAINS`,
      );
    }
  }

  // Display name, then given + surname, then fall back to the UPN.
  const fullName = [claim(profile, CLAIM.givenName), claim(profile, CLAIM.surname)]
    .filter(Boolean)
    .join(" ");
  const name = claim(profile, CLAIM.displayName) ?? (fullName || upn);

  return {
    // The Entra object id is the stable identifier; the UPN can be renamed.
    sub: objectId ?? upn,
    upn,
    email: email ?? upn,
    name,
    tid: tenantId,
    nameId: profile.nameID,
    nameIdFormat: profile.nameIDFormat,
    sessionIndex:
      typeof profile.sessionIndex === "string" ? profile.sessionIndex : undefined,
  };
}
