import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";

import { issueReport } from "@/lib/ca/issueReport";
import { resetCaDbForTests } from "@/lib/ca/offline/db";
import { draftHasPendingSync, getLocalDraft, saveLocalDraft } from "@/lib/ca/offline/draftStore";
import { createSyncEngine, type SyncTransport } from "@/lib/ca/offline/syncEngine";
import { formatLongDate, formatTime, itemsFromPhotos, move, photoRows } from "@/lib/ca/reportLayout";
import { createMockCaRepository } from "@/repositories/ca/mockCaRepository";
import type { ReportPutBody } from "@/services/ca/reportService";

import { photo, PROJECT, reportInput } from "./fixtures";

describe("print layout", () => {
  it("puts photos in rows of two; a lone photo is its own row (left column)", () => {
    expect(photoRows([])).toEqual([]);
    expect(photoRows(["a"])).toEqual([["a"]]);
    expect(photoRows(["a", "b", "c"])).toEqual([["a", "b"], ["c"]]);
    expect(photoRows(["a", "b", "c", "d"])).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("formats dates and times like the template", () => {
    expect(formatLongDate("2026-07-14")).toBe("July 14, 2026");
    expect(formatTime("09:05")).toBe("9:05 AM");
    expect(formatTime("13:30")).toBe("1:30 PM");
    expect(formatTime("00:15")).toBe("12:15 AM");
  });

  it("moves items within bounds only", () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });
});

describe("create report from selected photos", () => {
  it("makes one item per pin in photo order, then one for unpinned photos", () => {
    let n = 0;
    const items = itemsFromPhotos({
      photos: [
        { id: "p3", caption: "loose", takenAt: "2026-07-14T16:00:00Z" },
        { id: "p2", caption: "gym 1", pinId: "gym", takenAt: "2026-07-14T15:00:00Z" },
        { id: "p1", caption: "lib 1", pinId: "lib", takenAt: "2026-07-14T14:00:00Z" },
        { id: "p4", caption: "gym 2", pinId: "gym", takenAt: "2026-07-14T15:30:00Z" },
        { id: "p5", caption: "old pin", pinId: "deleted-pin", takenAt: "2026-07-14T17:00:00Z" },
      ],
      pins: [
        { id: "lib", label: "Library", note: "" },
        { id: "gym", label: "", note: "Floor slab" },
      ],
      pinNames: new Map([
        ["lib", "Library"],
        ["gym", "Pin 2"],
      ]),
      newId: () => `caitem_${++n}`,
    });
    expect(items.map((i) => [i.description, i.photos.map((p) => p.photoId)])).toEqual([
      ["Library", ["p1"]],
      ["Pin 2: Floor slab", ["p2", "p4"]],
      ["", ["p3", "p5"]],
    ]);
    expect(items[1].photos[1]).toEqual({ photoId: "p4", caption: "gym 2" });
    expect(items.every((i) => i.status === "in-progress")).toBe(true);
  });
});

describe("issuing", () => {
  async function setup() {
    const repo = createMockCaRepository({ dataDir: null });
    await repo.projects.create({ projectNumber: PROJECT, name: "S", source: "mock" }, "a");
    const report = await repo.reports.create(reportInput());
    await repo.photos.upsert(photo("caph_1"));
    return { repo, report };
  }

  it("refuses to issue a version other than the one reviewed", async () => {
    const { repo, report } = await setup();
    await repo.reports.saveDraft(PROJECT, report.id, report.draft, "2026-07-15T10:00:00.000Z");
    await expect(
      issueReport({ repo, projectNumber: PROJECT, reportId: report.id, issuedBy: "a", expectedDraftUpdatedAt: "2026-07-14T14:30:00.000Z" }),
    ).rejects.toMatchObject({ name: "CaConflictError" });
    const ok = await issueReport({
      repo,
      projectNumber: PROJECT,
      reportId: report.id,
      issuedBy: "a",
      expectedDraftUpdatedAt: "2026-07-15T10:00:00.000Z",
    });
    expect(ok?.revision.revision).toBe(0);
  });

  it("a repeated Issue with no changes returns the same revision, not Rev 1", async () => {
    const { repo, report } = await setup();
    const first = await issueReport({ repo, projectNumber: PROJECT, reportId: report.id, issuedBy: "a" });
    const again = await issueReport({ repo, projectNumber: PROJECT, reportId: report.id, issuedBy: "a" });
    expect(again?.revision.id).toBe(first?.revision.id);
    expect(await repo.reports.listRevisions(PROJECT, report.id)).toHaveLength(1);
  });

  it("an older draft edit arriving late never replaces a newer one", async () => {
    const { repo, report } = await setup();
    await repo.reports.saveDraft(PROJECT, report.id, { ...report.draft, comments: "new" }, "2026-07-15T10:00:00.000Z");
    await repo.reports.saveDraft(PROJECT, report.id, { ...report.draft, comments: "old" }, "2026-07-15T09:00:00.000Z");
    expect((await repo.reports.get(PROJECT, report.id))?.draft.comments).toBe("new");
  });

  it("only never-issued reports can be deleted", async () => {
    const { repo, report } = await setup();
    const other = await repo.reports.create(reportInput("carep_2"));
    await issueReport({ repo, projectNumber: PROJECT, reportId: report.id, issuedBy: "a" });
    expect(await repo.reports.deleteDraft(PROJECT, report.id)).toBe("issued");
    expect(await repo.reports.deleteDraft(PROJECT, other.id)).toBe("deleted");
    expect(await repo.reports.deleteDraft(PROJECT, other.id)).toBe("missing");
  });
});

describe("offline drafts", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetCaDbForTests();
  });

  it("many edits offline reach the server once, as the latest version", async () => {
    const puts: ReportPutBody[] = [];
    let online = false;
    const transport: SyncTransport = {
      putPhoto: async () => ({}),
      putPin: async () => ({}),
      putReport: async (_p, _id, body) => {
        puts.push(body);
        return {};
      },
    };
    const engine = createSyncEngine({ transport, isOnline: () => online });
    const base = reportInput().draft;
    for (const comments of ["a", "ab", "abc"]) {
      await saveLocalDraft({ id: "carep_9", projectNumber: PROJECT, content: { ...base, comments }, createdAt: "2026-07-14T14:30:00.000Z" });
    }
    await engine.syncNow();
    expect(puts).toHaveLength(0);
    expect(await draftHasPendingSync("carep_9")).toBe(true);

    online = true;
    await engine.syncNow();
    expect(puts.map((p) => p.draft.comments)).toEqual(["abc"]);
    expect(await draftHasPendingSync("carep_9")).toBe(false);
    expect((await getLocalDraft("carep_9"))?.syncState).toBe("synced");
  });
});
