import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";

import { archProjectNumberFromWbs, mapCcrProjects } from "@/lib/ca/ccrProjects";
import { CaNotConfiguredError, type CaProjectSource } from "@/lib/ca/contracts";
import { resetCaDbForTests } from "@/lib/ca/offline/db";
import { getLocalDraft, listAllLocalDrafts, saveLocalDraft } from "@/lib/ca/offline/draftStore";
import { captureFiles, listLocalPhotos } from "@/lib/ca/offline/photoStore";
import { createSyncEngine, type SyncTransport } from "@/lib/ca/offline/syncEngine";
import { photosAvailableToReport, photosOfReport } from "@/lib/ca/reportPhotos";
import { caReportPath, caReportPrintPath, isCaReportStep } from "@/lib/ca/routes";
import { normalizeSearch, reportMatches } from "@/lib/ca/search";
import { loadSourceProjects } from "@/lib/ca/sourceProjects";
import { validatePhotoMeta } from "@/lib/ca/validation";
import type { PhotoMeta } from "@/services/ca/photoService";
import type { ReportPutBody } from "@/services/ca/reportService";
import { CA_DISCIPLINES, CA_DISCIPLINE_LABELS, isCaDiscipline, type CaSourceProject } from "@/types/ca";

import { PROJECT, reportInput } from "./fixtures";

describe("disciplines", () => {
  it("are the five Parkhill disciplines, in order, with labels", () => {
    expect(CA_DISCIPLINES.map((d) => CA_DISCIPLINE_LABELS[d])).toEqual([
      "Architecture",
      "Civil",
      "MP",
      "Electrical",
      "Structural",
    ]);
    expect(isCaDiscipline("civil")).toBe(true);
    expect(isCaDiscipline("Civil")).toBe(false);
    expect(isCaDiscipline(undefined)).toBe(false);
  });
});

describe("report steps (query string)", () => {
  it("opens the Report step by default and other steps with &step=", () => {
    expect(caReportPath("P-1", "carep_1")).toBe("/field-reports/P-1/reports?report=carep_1");
    expect(caReportPath("P-1", "carep_1", "report")).toBe("/field-reports/P-1/reports?report=carep_1");
    expect(caReportPath("P-1", "carep_1", "capture")).toBe("/field-reports/P-1/reports?report=carep_1&step=capture");
    expect(caReportPath("P-1", "carep_1", "route")).toBe("/field-reports/P-1/reports?report=carep_1&step=route");
    expect(caReportPrintPath("P-1", "carep_1", 0)).toBe("/field-reports/P-1/reports?report=carep_1&view=print&rev=0");
    expect(isCaReportStep("capture")).toBe(true);
    expect(isCaReportStep("reports")).toBe(false);
  });
});

describe("report photos", () => {
  const photos = [{ id: "a", reportId: "r1" }, { id: "b", reportId: "r2" }, { id: "c" }];
  it("a report's own photos, and those it may use (its own plus older unassigned ones)", () => {
    expect(photosOfReport(photos, "r1").map((p) => p.id)).toEqual(["a"]);
    expect(photosAvailableToReport(photos, "r1").map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("photo metadata accepts a report id and rejects a bad one", () => {
    const meta: PhotoMeta = {
      caption: "",
      fileName: "a.jpg",
      takenAt: "2026-07-14T14:30:00.000Z",
      clientUpdatedAt: "2026-07-14T14:30:00.000Z",
      reportId: "carep_lz1abc_0123456789ab",
    };
    expect(validatePhotoMeta(meta)).toBeNull();
    expect(validatePhotoMeta({ ...meta, reportId: "../etc" })).toBe("Invalid report id.");
  });
});

describe("search", () => {
  it("normalizes 2-100 characters", () => {
    expect(normalizeSearch("  Civil ")).toBe("civil");
    expect(normalizeSearch("a")).toBeNull();
    expect(normalizeSearch("x".repeat(101))).toBeNull();
    expect(normalizeSearch(undefined)).toBeNull();
  });

  it("matches report number, author, discipline and project", () => {
    const report = { ...reportInput(), reportNumber: "007", discipline: "mp" as const, createdByName: "Brett Rodgers" };
    expect(reportMatches(report, "007")).toBe(true);
    expect(reportMatches(report, "rodgers")).toBe(true);
    expect(reportMatches(report, "mp")).toBe(true);
    expect(reportMatches(report, "elementary")).toBe(true);
    expect(reportMatches(report, "mock-45371")).toBe(true);
    expect(reportMatches(report, "fire station")).toBe(false);
  });
});

describe("CA application projects (parkhill-ccr)", () => {
  it("maps active projects, skipping archived, invalid and duplicate numbers", () => {
    const offers = mapCcrProjects([
      { id: "p2", archProjectNumber: "51022.00.01", name: " Fire Station 7 ", archived: false, contractorName: "x" },
      { id: "p1", archProjectNumber: "45371.25.01", name: "Elementary School 01" },
      { id: "p3", archProjectNumber: "60310.10", name: "Old project", archived: true },
      { id: "p4", archProjectNumber: "bad number!", name: "Broken" },
      { id: "p5", archProjectNumber: "45371.25.01", name: "Duplicate" },
      { id: "p6", archProjectNumber: "70000.01", name: "" },
      null,
    ]);
    expect(offers).toEqual([
      { projectNumber: "45371.25.01", name: "Elementary School 01", client: "", source: "ca-app", externalRef: "p1" },
      { projectNumber: "51022.00.01", name: "Fire Station 7", client: "", source: "ca-app", externalRef: "p2" },
    ]);
  });

  it("refuses a body that is not a list", () => {
    expect(() => mapCcrProjects({ error: "nope" })).toThrow(/unexpected/);
  });

  it("converts a VantagePoint WBS number the way the CA application does", () => {
    expect(archProjectNumberFromWbs("4537125.01")).toBe("45371.25.01");
    expect(archProjectNumberFromWbs("004537125.00")).toBe("45371.25");
    // Already in CA form, or not a single-dot WBS number: unchanged.
    expect(archProjectNumberFromWbs("45371.25.01")).toBe("45371.25.01");
    expect(archProjectNumberFromWbs("MOCK-1")).toBe("MOCK-1");
  });
});

describe("New Project source list", () => {
  const offer = (projectNumber: string, source: CaSourceProject["source"]): CaSourceProject => ({
    projectNumber,
    name: projectNumber,
    source,
  });
  const ok = (kind: CaSourceProject["source"], numbers: string[]): CaProjectSource => ({
    kind,
    list: async () => numbers.map((n) => offer(n, kind)),
  });
  const down = (kind: CaSourceProject["source"], message = "The CA application could not be reached."): CaProjectSource => ({
    kind,
    list: async () => {
      throw new CaNotConfiguredError(message);
    },
  });

  it("uses the primary source and marks projects that already exist", async () => {
    const result = await loadSourceProjects({
      primary: ok("ca-app", ["A", "B"]),
      fallback: ok("vantagepoint", ["C"]),
      existingProjectNumbers: ["B"],
    });
    expect(result.source).toBe("ca-app");
    expect(result.fellBackFrom).toBeUndefined();
    expect(result.projects.map((p) => [p.projectNumber, p.alreadyCreated])).toEqual([
      ["A", false],
      ["B", true],
    ]);
  });

  it("falls back to VantagePoint when the CA application is down, and says so", async () => {
    const result = await loadSourceProjects({
      primary: down("ca-app"),
      fallback: ok("vantagepoint", ["C"]),
      existingProjectNumbers: ["C"],
    });
    expect(result).toMatchObject({
      source: "vantagepoint",
      fellBackFrom: "ca-app",
      notice: "The CA application could not be reached.",
    });
    expect(result.projects).toEqual([{ ...offer("C", "vantagepoint"), alreadyCreated: true }]);
  });

  it("reports no source when every source fails, so manual entry is offered", async () => {
    const vpDown: CaProjectSource = { kind: "vantagepoint", list: async () => Promise.reject(new Error("Fabric down")) };
    const result = await loadSourceProjects({ primary: down("ca-app"), fallback: vpDown, existingProjectNumbers: [] });
    expect(result).toEqual({ source: null, notice: "The CA application could not be reached.", projects: [] });
  });

  it("does not leak unexpected error details", async () => {
    const leaky: CaProjectSource = { kind: "ca-app", list: async () => Promise.reject(new Error("token=secret")) };
    const result = await loadSourceProjects({ primary: leaky, fallback: null, existingProjectNumbers: [] });
    expect(result.notice).toBe("The project list could not be loaded.");
  });

  it("reports no source when none is configured", async () => {
    expect(await loadSourceProjects({ primary: null, fallback: null, existingProjectNumbers: [] })).toEqual({
      source: null,
      projects: [],
    });
  });
});

describe("offline: report discipline, author and photos", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetCaDbForTests();
  });

  it("a started draft keeps its discipline and author through later edits, and sync sends the discipline", async () => {
    const puts: ReportPutBody[] = [];
    const transport: SyncTransport = {
      putPhoto: async () => ({}),
      putPin: async () => ({}),
      putReport: async (_p, _id, body) => {
        puts.push(body);
        return {};
      },
    };
    const base = reportInput().draft;
    await saveLocalDraft({
      id: "carep_7",
      projectNumber: PROJECT,
      content: base,
      createdAt: "2026-07-14T14:30:00.000Z",
      discipline: "structural",
      createdByName: "Brett Rodgers",
    });
    // A later editor save passes neither; they are kept.
    await saveLocalDraft({ id: "carep_7", projectNumber: PROJECT, content: { ...base, comments: "x" }, createdAt: "2026-07-14T14:30:00.000Z" });

    expect(await getLocalDraft("carep_7")).toMatchObject({ discipline: "structural", createdByName: "Brett Rodgers" });
    expect((await listAllLocalDrafts()).map((d) => d.id)).toEqual(["carep_7"]);

    await createSyncEngine({ transport, isOnline: () => true }).syncNow();
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatchObject({ discipline: "structural" });
    expect(puts[0].draft.comments).toBe("x");
  });

  it("photos captured in a report carry its id and sync it", async () => {
    const metas: PhotoMeta[] = [];
    const transport: SyncTransport = {
      putPhoto: async (_p, _id, meta) => {
        metas.push(meta);
        return {};
      },
      putPin: async () => ({}),
      putReport: async () => ({}),
    };
    const file = new File([new Uint8Array([0xff, 0xd8, 1])], "a.jpg", { type: "image/jpeg" });
    await captureFiles(PROJECT, [file], {
      reportId: "carep_7",
      downscale: async (f) => ({ blob: f, width: 10, height: 10 }),
    });
    expect((await listLocalPhotos(PROJECT))[0].reportId).toBe("carep_7");
    await createSyncEngine({ transport, isOnline: () => true }).syncNow();
    expect(metas[0].reportId).toBe("carep_7");
  });
});
