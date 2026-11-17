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
    vi.stubEnv("CA_DRAWING_SOURCE", "");
    expect(caConfig.projectSource).toBe("none");
    expect(caConfig.drawingSource).toBe("none");
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
