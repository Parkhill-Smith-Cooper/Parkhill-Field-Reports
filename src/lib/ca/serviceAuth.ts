import "server-only";

import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

/**
 * Service-to-service calls into Field Reports (today only the CA
 * application's drawing-set push). These do not carry a user session: the
 * caller presents an app-only Entra token for this app's API with an
 * application role, and is only accepted from one client id.
 *
 * Checks: signature (tenant keys), issuer (v1 or v2 for the tenant),
 * audience, expiry, `roles` contains the role, no delegated `scp` (an
 * app-only token, not a user's), and `azp`/`appid` is the allowed client.
 */

export const DRAWING_SYNC_ROLE = "FieldReports.DrawingSync";

export type ServiceAuthOptions = {
  tenantId: string;
  /** One or more accepted audiences, comma-separated in config. */
  audiences: string[];
  allowedClientId: string;
  role: string;
  /** Signing keys; the tenant's published keys unless given (tests). */
  keys?: JWTVerifyGetKey;
};

export type ServiceAuthResult =
  | { ok: true; clientId: string; claims: JWTPayload }
  | { ok: false; status: 401 | 403; reason: string };

declare global {
  var __caTenantKeys: Map<string, JWTVerifyGetKey> | undefined;
}

function tenantKeys(tenantId: string): JWTVerifyGetKey {
  globalThis.__caTenantKeys ??= new Map();
  let keys = globalThis.__caTenantKeys.get(tenantId);
  if (!keys) {
    keys = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/discovery/v2.0/keys`),
    );
    globalThis.__caTenantKeys.set(tenantId, keys);
  }
  return keys;
}

/** The bearer token from an `Authorization` header, or null. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export async function verifyServiceToken(token: string | null, options: ServiceAuthOptions): Promise<ServiceAuthResult> {
  if (!token) return { ok: false, status: 401, reason: "missing bearer token" };
  let claims: JWTPayload;
  try {
    ({ payload: claims } = await jwtVerify(token, options.keys ?? tenantKeys(options.tenantId), {
      issuer: [
        `https://login.microsoftonline.com/${options.tenantId}/v2.0`,
        `https://sts.windows.net/${options.tenantId}/`,
      ],
      audience: options.audiences,
      algorithms: ["RS256"],
      clockTolerance: 60,
    }));
  } catch (error) {
    return { ok: false, status: 401, reason: error instanceof Error ? error.message : "invalid token" };
  }

  const clientId = String(claims.azp ?? claims.appid ?? "");
  if (claims.scp !== undefined) return { ok: false, status: 403, reason: "delegated (user) token" };
  if (!clientId || clientId.toLowerCase() !== options.allowedClientId.toLowerCase()) {
    return { ok: false, status: 403, reason: `client ${clientId || "(none)"} not allowed` };
  }
  const roles = Array.isArray(claims.roles) ? claims.roles : [];
  if (!roles.includes(options.role)) return { ok: false, status: 403, reason: `missing role ${options.role}` };
  return { ok: true, clientId, claims };
}
