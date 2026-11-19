import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ccrPaths, mapCcrDrawings } from "@/lib/ca/ccrDrawings";
import { isCaError } from "@/lib/ca/contracts";
import { validateDrawingSetCommit } from "@/lib/ca/validation";

vi.mock("@/lib/azure/credential", () => ({
  azureCredential: () => ({ getToken: async () => ({ token: "test-token", expiresOnTimestamp: Date.now() + 60_000 }) }),
}));

/** Recorded from parkhill-ccr `toServiceDrawing` (services/documentControl.js). Not real project data. */
const CCR_LATEST = [
  {
    externalRef: "ccr-project-1-v3",
    title: "100% CD",
    revisionLabel: "v3 — 100% CD",
    isLatestApproved: true,
    fileType: "pdf",
    fileName: "CD Set.pdf",
    version: 3,
    uploadedAt: "2026-11-18T10:00:00.000Z",
    size: 12_582_912,
  },
];

describe("CA application drawings (Document Control) mapping", () => {
  it("maps the current set to an offered PDF drawing set", () => {
    expect(mapCcrDrawings(CCR_LATEST)).toEqual([
      {
        externalRef: "ccr-project-1-v3",
        title: "100% CD",
        revisionLabel: "v3 — 100% CD",
        isLatestApproved: true,
        fileType: "pdf",
        fileName: "CD Set.pdf",
        sizeBytes: 12_582_912,
      },
    ]);
  });

  it("no set yet is an empty list", () => {
    expect(mapCcrDrawings([])).toEqual([]);
  });

  it("takes 'latest approved' only as stated, and skips what it cannot import", () => {
    const [stated] = mapCcrDrawings([{ ...CCR_LATEST[0], isLatestApproved: "yes" }]);
    expect(stated.isLatestApproved).toBe(false);
    expect(
      mapCcrDrawings([
        { ...CCR_LATEST[0], externalRef: "" },
        { ...CCR_LATEST[0], fileType: "image" },
        { ...CCR_LATEST[0], externalRef: "x".repeat(301) },
        null,
      ]),
    ).toEqual([]);
  });

  it("fills in a missing title and a file name without .pdf", () => {
    const [offer] = mapCcrDrawings([{ externalRef: "v1", fileType: "pdf", fileName: "Set", isLatestApproved: true }]);
    expect(offer).toMatchObject({ title: "Drawing set", fileName: "Set.pdf" });
    expect(offer).not.toHaveProperty("sizeBytes");
    expect(offer).not.toHaveProperty("revisionLabel");
  });

  it("refuses a body that is not a list", () => {
    expect(() => mapCcrDrawings({ current: null })).toThrow(/unexpected drawing list/);
  });

  it("builds the two service paths with the number and version encoded", () => {
    expect(ccrPaths.latestDrawings("45371.25.01")).toBe("/api/document-control/service/projects/number/45371.25.01/latest");
    expect(ccrPaths.drawingFile("45371.25.01", "abc-v2")).toBe(
      "/api/document-control/service/projects/number/45371.25.01/versions/abc-v2/file",
    );
    expect(ccrPaths.drawingFile("A/B", "x?y")).toBe("/api/document-control/service/projects/number/A%2FB/versions/x%3Fy/file");
  });
});

describe("caAppDrawingSource (ccr calls, fetch stubbed)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("CA_APP_API_BASE_URL", "https://ccr.example.test/");
    vi.stubEnv("CA_APP_API_SCOPE", "api://ccr-test/.default");
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  const source = async () => (await import("@/repositories/ca/sources")).caAppDrawingSource;

  it("lists the current set with an app-only token", async () => {
    fetchMock.mockResolvedValue(Response.json(CCR_LATEST));
    const offers = await (await source()).listLatest("45371.25.01");
    expect(offers.map((o) => o.externalRef)).toEqual(["ccr-project-1-v3"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ccr.example.test/api/document-control/service/projects/number/45371.25.01/latest");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
  });

  it("a project the CA application does not have offers nothing", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "Project not found." }, { status: 404 }));
    expect(await (await source()).listLatest("MANUAL-1")).toEqual([]);
  });

  it("401/403/5xx become a plain 'not available' error", async () => {
    for (const status of [401, 403, 500]) {
      fetchMock.mockResolvedValueOnce(Response.json({ error: "no" }, { status }));
      const error = await (await source()).listLatest("45371.25.01").catch((e: unknown) => e);
      expect(isCaError(error, "CaNotConfiguredError")).toBe(true);
      expect((error as Error).message).toMatch(/could not be loaded/);
    }
  });

  it("not configured is said as such, without calling ccr", async () => {
    vi.stubEnv("CA_APP_API_BASE_URL", "");
    const error = await (await source()).listLatest("45371.25.01").catch((e: unknown) => e);
    expect(isCaError(error, "CaNotConfiguredError")).toBe(true);
    expect((error as Error).message).toMatch(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("streams the set's PDF without buffering it", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { headers: { "Content-Type": "application/pdf" } }));
    const file = await (await source()).fetchFile("45371.25.01", "ccr-project-1-v3");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://ccr.example.test/api/document-control/service/projects/number/45371.25.01/versions/ccr-project-1-v3/file",
    );
    expect(file.contentType).toBe("application/pdf");
    expect(file.bytes).toBeInstanceOf(ReadableStream);
    expect(new Uint8Array(await new Response(file.bytes as ReadableStream<Uint8Array>).arrayBuffer())).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  });

  it("a missing file is a plain error", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "Version not found." }, { status: 404 }));
    const error = await (await source()).fetchFile("45371.25.01", "gone").catch((e: unknown) => e);
    expect(isCaError(error, "CaNotConfiguredError")).toBe(true);
    expect((error as Error).message).toMatch(/could not be downloaded/);
  });
});

describe("drawing set commit: where an imported set came from", () => {
  const commit = {
    fileName: "CD Set.pdf",
    blockCount: 1,
    pageCount: 1,
    sheets: [{ page: 1, sheetNumber: "", sheetName: "", naming: "guess" }],
  };

  it("is optional", () => {
    expect(validateDrawingSetCommit(commit)).toBeNull();
  });

  it("accepts a source with its reference and revision label", () => {
    expect(
      validateDrawingSetCommit({ ...commit, source: "ca-app", externalRef: "ccr-project-1-v3", revisionLabel: "v3 — 100% CD" }),
    ).toBeNull();
  });

  it("refuses a partial or unknown origin", () => {
    expect(validateDrawingSetCommit({ ...commit, source: "ca-app" })).toBe("Invalid drawing reference.");
    expect(validateDrawingSetCommit({ ...commit, externalRef: "v1" })).toBe("Invalid drawing source.");
    expect(validateDrawingSetCommit({ ...commit, source: "upload", externalRef: "v1" })).toBe("Invalid drawing source.");
    expect(validateDrawingSetCommit({ ...commit, source: "ca-app", externalRef: "x".repeat(301) })).toBe(
      "Invalid drawing reference.",
    );
    expect(validateDrawingSetCommit({ ...commit, source: "ca-app", externalRef: "v1", revisionLabel: 3 })).toBe(
      "Invalid revision label.",
    );
  });
});
