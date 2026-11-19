import { afterEach, describe, expect, it, vi } from "vitest";

import { caConfig } from "@/lib/ca/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CA config", () => {
  it("defaults to mock everything in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CA_DATA_MODE", "");
    vi.stubEnv("CA_PROJECT_SOURCE", "");
    vi.stubEnv("CA_DRAWING_SOURCE", "");
    expect(caConfig.dataMode).toBe("mock");
    expect(caConfig.projectSource).toBe("mock");
    expect(caConfig.drawingSource).toBe("mock");
  });

  it("fails closed in production when CA_DATA_MODE is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CA_DATA_MODE", "");
    expect(() => caConfig.dataMode).toThrow(/CA_DATA_MODE/);
  });

  it("azure mode does not default any source to mock", () => {
    vi.stubEnv("CA_DATA_MODE", "azure");
    vi.stubEnv("CA_PROJECT_SOURCE", "");
    vi.stubEnv("CA_PROJECT_FALLBACK_SOURCE", "");
    vi.stubEnv("CA_DRAWING_SOURCE", "");
    // The CA application is the primary project source, VantagePoint the fallback,
    // and its Document Control module the drawing source.
    expect(caConfig.projectSource).toBe("ca-app");
    expect(caConfig.projectFallbackSource).toBe("vantagepoint");
    expect(caConfig.drawingSource).toBe("ca-app");
  });

  it("mock mode has no fallback project source by default", () => {
    vi.stubEnv("CA_DATA_MODE", "mock");
    vi.stubEnv("CA_PROJECT_FALLBACK_SOURCE", "");
    expect(caConfig.projectFallbackSource).toBe("none");
    vi.stubEnv("CA_PROJECT_FALLBACK_SOURCE", "ldap");
    expect(() => caConfig.projectFallbackSource).toThrow(/Invalid CA_PROJECT_FALLBACK_SOURCE/);
  });

  it("trims a trailing slash from the CA app base URL", () => {
    vi.stubEnv("CA_APP_API_BASE_URL", "https://ccr.example.test/");
    expect(caConfig.caAppApiBaseUrl).toBe("https://ccr.example.test");
  });

  it("rejects unknown values by name", () => {
    vi.stubEnv("CA_DATA_MODE", "sqlite");
    expect(() => caConfig.dataMode).toThrow(/Invalid CA_DATA_MODE/);
  });

  it("names missing CA app settings", () => {
    vi.stubEnv("CA_APP_API_BASE_URL", "");
    expect(() => caConfig.caAppApiBaseUrl).toThrow(/CA_APP_API_BASE_URL/);
  });
});
