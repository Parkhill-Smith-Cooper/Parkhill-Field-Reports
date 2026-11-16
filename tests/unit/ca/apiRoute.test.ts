import { describe, expect, it, vi } from "vitest";

import { caRoute } from "@/lib/ca/apiRoute";

/**
 * An error thrown by a repository cached on globalThis comes from a different
 * bundle's copy of the error class, so it fails `instanceof`. These stand-ins
 * are deliberately NOT the classes from contracts.ts: only the name matches,
 * which is exactly the situation in the Next dev server.
 */
function foreignError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

async function statusOf(error: Error) {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await caRoute("test", async () => {
    throw error;
  });
  return { status: response.status, body: (await response.json()) as { error: string } };
}

describe("caRoute error mapping", () => {
  it("maps a conflict from another bundle to 409 with its message", async () => {
    const result = await statusOf(foreignError("CaConflictError", "Project X is already set up."));
    expect(result).toEqual({ status: 409, body: { error: "Project X is already set up." } });
  });

  it("maps not-configured to 503 and missing photos to 422", async () => {
    expect((await statusOf(foreignError("CaNotConfiguredError", "Not connected"))).status).toBe(503);
    expect((await statusOf(foreignError("MissingPhotoError", "Sync first"))).status).toBe(422);
    expect((await statusOf(foreignError("RevisionAlreadyExistsError", "Taken"))).status).toBe(409);
  });

  it("names a bad CA_ setting", async () => {
    const result = await statusOf(new Error('Invalid CA_DATA_MODE="x". Expected one of: mock, azure.'));
    expect(result.status).toBe(500);
    expect(result.body.error).toMatch(/CA_DATA_MODE/);
  });

  it("hides unexpected errors behind a generic message", async () => {
    const result = await statusOf(new Error("socket hang up at 10.0.0.4"));
    expect(result.status).toBe(500);
    expect(result.body.error).not.toMatch(/10\.0\.0\.4/);
  });
});
