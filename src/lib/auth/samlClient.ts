import "server-only";

import { SAML, ValidateInResponseTo } from "@node-saml/node-saml";

/**
 * The SAML service provider.
 *
 * Configuration comes from environment variables so the same build works
 * against a test and a production Entra enterprise application. The signing
 * certificate is the IdP's *public* certificate, so it is configuration rather
 * than a secret - the only real secret in this area is SESSION_SECRET.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See the ` +
        '"Authentication" section of the README for the Entra enterprise ' +
        "application setup and the values it produces.",
    );
  }
  return value;
}

/** Public base URL of this deployment, used to derive the SP endpoints. */
export function appBaseUrl(): string {
  return required("APP_BASE_URL").replace(/\/$/, "");
}

/** The SP entity id Entra calls the "Identifier". */
export function spEntityId(): string {
  return process.env.SAML_SP_ENTITY_ID || `${appBaseUrl()}/api/saml/metadata`;
}

/** The Assertion Consumer Service - Entra calls this the "Reply URL". */
export function acsUrl(): string {
  return `${appBaseUrl()}/api/saml/acs`;
}

/**
 * A certificate may be pasted either bare (as Entra shows it) or as full PEM.
 * node-saml accepts both, but normalising here means one less way for setup to
 * fail silently.
 */
function idpCert(): string {
  const raw = required("SAML_IDP_CERT").trim();
  return raw
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
}

/**
 * Builds the SAML provider.
 *
 * `generateUniqueId` is overridable so the login route can pin the
 * AuthnRequest id it is about to issue, then check the response's
 * `InResponseTo` against it - see the comments in the login and ACS routes for
 * why that replaces node-saml's cache-backed validation.
 */
export function samlProvider(options?: { requestId?: string }): SAML {
  return new SAML({
    // --- Identity provider (Entra) ---
    entryPoint: required("SAML_ENTRY_POINT"),
    idpCert: idpCert(),
    idpIssuer: process.env.SAML_IDP_ISSUER,
    logoutUrl: process.env.SAML_LOGOUT_URL,

    // --- Service provider (this app) ---
    issuer: spEntityId(),
    callbackUrl: acsUrl(),

    // --- Assertion requirements ---
    // Reject anything not signed by the IdP, and reject an assertion that was
    // not issued for this application.
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
    audience: spEntityId(),
    // No NameIDPolicy is requested by default, so Entra issues NameID in
    // whatever format the enterprise application is configured for. Demanding
    // a format here is a common cause of setup failure: if it disagrees with
    // the portal's "Name identifier format" setting, every sign-in fails with
    // an opaque error. Nothing in this app depends on the format - identity
    // comes from the UPN claim - so the compatible default is to accept what
    // Entra sends. Set SAML_NAMEID_FORMAT only if IT needs a specific one.
    identifierFormat: process.env.SAML_NAMEID_FORMAT || null,
    // Entra does not honour a requested authn context; asking for one makes it
    // reject the request.
    disableRequestedAuthnContext: true,
    // Tolerate modest clock drift between App Service and Entra, but keep the
    // window for accepting an assertion short.
    acceptedClockSkewMs: 5000,
    maxAssertionAgeMs: 5 * 60 * 1000,

    // InResponseTo is validated by this application rather than by node-saml.
    // node-saml's own check needs a shared cache of issued request ids, and
    // its bundled in-memory cache is documented as unsuitable once more than
    // one instance is running - which is exactly what App Service scale-out
    // does. The login route signs the request id into RelayState instead, and
    // the ACS route compares it, which is stateless and survives scale-out.
    validateInResponseTo: ValidateInResponseTo.never,
    ...(options?.requestId ? { generateUniqueId: () => options.requestId! } : {}),
  });
}

/**
 * SP metadata XML.
 *
 * Worth having: Parkhill IT can upload this straight into the Entra enterprise
 * application instead of transcribing the entity id and reply URL by hand,
 * which is the step most likely to be typed wrong.
 */
export function serviceProviderMetadata(): string {
  return samlProvider().generateServiceProviderMetadata(null, null);
}
