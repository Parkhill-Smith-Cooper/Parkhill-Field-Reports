import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWTPayload } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { bearerToken, DRAWING_SYNC_ROLE, verifyServiceToken, type ServiceAuthOptions } from "@/lib/ca/serviceAuth";
import { validateDrawingSyncPush } from "@/lib/ca/validation";

/**
 * The CA application's push is accepted only with an app-only Entra token
 * for this API, with the drawing-sync role, from the CA app's identity.
 * Keys here are generated locally; nothing calls Entra.
 */

const TENANT = "11111111-2222-3333-4444-555555555555";
const AUDIENCE = "api://field-reports";
const CCR = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

let sign: (claims: JWTPayload, opts?: { issuer?: string; audience?: string; expiresIn?: string }) => Promise<string>;
let options: ServiceAuthOptions;
let otherKeySign: () => Promise<string>;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  options = {
    tenantId: TENANT,
    audiences: [AUDIENCE],
    allowedClientId: CCR,
    role: DRAWING_SYNC_ROLE,
    keys: createLocalJWKSet({ keys: [jwk] }),
  };
  sign = (claims, opts = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(opts.issuer ?? `https://login.microsoftonline.com/${TENANT}/v2.0`)
      .setAudience(opts.audience ?? AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? "5m")
      .sign(privateKey);
  const other = await generateKeyPair("RS256");
  otherKeySign = () =>
    new SignJWT({ azp: CCR, roles: [DRAWING_SYNC_ROLE] })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(`https://login.microsoftonline.com/${TENANT}/v2.0`)
      .setAudience(AUDIENCE)
      .setExpirationTime("5m")
      .sign(other.privateKey);
});

describe("verifyServiceToken", () => {
  it("accepts the CA app's app-only token with the role (v2 and v1 issuers)", async () => {
    expect(await verifyServiceToken(await sign({ azp: CCR, roles: [DRAWING_SYNC_ROLE] }), options)).toMatchObject({
      ok: true,
      clientId: CCR,
    });
    const v1 = await sign({ appid: CCR, roles: [DRAWING_SYNC_ROLE] }, { issuer: `https://sts.windows.net/${TENANT}/` });
    expect(await verifyServiceToken(v1, options)).toMatchObject({ ok: true });
  });

  it.each([
    ["no token", async () => null, 401],
    ["another signing key", () => otherKeySign(), 401],
    ["wrong audience", () => sign({ azp: CCR, roles: [DRAWING_SYNC_ROLE] }, { audience: "api://other" }), 401],
    ["another tenant", () => sign({ azp: CCR, roles: [DRAWING_SYNC_ROLE] }, { issuer: "https://login.microsoftonline.com/x/v2.0" }), 401],
    ["expired", () => sign({ azp: CCR, roles: [DRAWING_SYNC_ROLE] }, { expiresIn: "-10m" }), 401],
    ["another client", () => sign({ azp: "someone-else", roles: [DRAWING_SYNC_ROLE] }), 403],
    ["missing role", () => sign({ azp: CCR, roles: ["FieldReports.Read"] }), 403],
    ["a user's delegated token", () => sign({ azp: CCR, roles: [DRAWING_SYNC_ROLE], scp: "user_impersonation" }), 403],
  ] as [string, () => Promise<string | null>, number][])("refuses %s", async (_label, make, status) => {
    expect(await verifyServiceToken(await make(), options)).toMatchObject({ ok: false, status });
  });

  it("reads only well-formed bearer headers", () => {
    const req = (value?: string) => new Request("http://x", { headers: value ? { authorization: value } : {} });
    expect(bearerToken(req("Bearer abc.def.ghi"))).toBe("abc.def.ghi");
    expect(bearerToken(req("Basic abc"))).toBeNull();
    expect(bearerToken(req())).toBeNull();
  });
});

describe("push body", () => {
  it("names a project and an event", () => {
    expect(validateDrawingSyncPush({ projectNumber: "1.10", versionId: "p-v3", event: "published" })).toBeNull();
    expect(validateDrawingSyncPush({ projectNumber: "1.10", event: "removed" })).toBeNull();
    expect(validateDrawingSyncPush({ projectNumber: "../x", event: "published" })).toMatch(/project/);
    expect(validateDrawingSyncPush({ projectNumber: "1.10", event: "deleted-everything" })).toMatch(/event/);
    expect(validateDrawingSyncPush(null)).toMatch(/object/);
  });
});

describe("push route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("answers 503 when not configured, before reading anything", async () => {
    vi.stubEnv("CA_SYNC_TENANT_ID", "");
    const { POST } = await import("@/app/api/ca/integrations/ccr/drawing-sets/route");
    const response = await POST(new Request("http://x", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
  });

  it("refuses a request with no token", async () => {
    vi.stubEnv("CA_SYNC_TENANT_ID", TENANT);
    vi.stubEnv("CA_SYNC_API_AUDIENCE", AUDIENCE);
    vi.stubEnv("CA_SYNC_ALLOWED_CLIENT_ID", CCR);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await import("@/app/api/ca/integrations/ccr/drawing-sets/route");
    const response = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ projectNumber: "1.10", event: "published" }) }),
    );
    expect(response.status).toBe(401);
  });
});
