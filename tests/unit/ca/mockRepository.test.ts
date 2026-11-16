import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CaConflictError } from "@/lib/ca/contracts";
import { issueReport } from "@/lib/ca/issueReport";
import { MissingPhotoError, RevisionAlreadyExistsError } from "@/lib/ca/revisions";
import { createMockCaRepository } from "@/repositories/ca/mockCaRepository";

import { PROJECT, photo, pin, reportInput } from "./fixtures";

const repo = () => createMockCaRepository({ dataDir: null });

describe("mock CA repository: projects", () => {
  it("creates, lists and refuses duplicates", async () => {
    const r = repo();
    await r.projects.create(
      { projectNumber: PROJECT, name: "School", source: "mock" },
      "a@parkhill.com",
    );
    expect((await r.projects.list()).map((p) => p.id)).toEqual([PROJECT]);
    await expect(
      r.projects.create({ projectNumber: PROJECT, name: "Again", source: "manual" }, "a"),
    ).rejects.toBeInstanceOf(CaConflictError);
  });

  it("delete removes every record under the project", async () => {
    const r = repo();
    await r.projects.create({ projectNumber: PROJECT, name: "S", source: "mock" }, "a");
    await r.photos.upsert(photo("caph_1"));
    await r.reports.create(reportInput());
    expect(await r.projects.delete(PROJECT)).toBe(true);
    expect(await r.photos.list(PROJECT)).toEqual([]);
    expect(await r.reports.list(PROJECT)).toEqual([]);
    expect(await r.projects.delete(PROJECT)).toBe(false);
  });
});

describe("mock CA repository: idempotent capture sync", () => {
  it("a retried photo upload never creates a second record", async () => {
    const r = repo();
    await r.photos.upsert(photo("caph_1"));
    await r.photos.upsert(photo("caph_1"));
    await r.photos.upsert(photo("caph_1"));
    expect(await r.photos.list(PROJECT)).toHaveLength(1);
  });

  it("newer caption edits win; late, older edits are ignored", async () => {
    const r = repo();
    await r.photos.upsert(photo("caph_1", { caption: "v1" }));
    await r.photos.upsert(
      photo("caph_1", { caption: "v3", clientUpdatedAt: "2026-07-14T15:00:00.000Z" }),
    );
    await r.photos.upsert(
      photo("caph_1", { caption: "v2", clientUpdatedAt: "2026-07-14T14:45:00.000Z" }),
    );
    expect((await r.photos.get(PROJECT, "caph_1"))?.caption).toBe("v3");
  });

  it("a photo's file path is fixed at first write", async () => {
    const r = repo();
    await r.photos.upsert(photo("caph_1"));
    await r.photos.upsert(
      photo("caph_1", {
        filePath: "OTHER/photos/x.jpg",
        clientUpdatedAt: "2026-07-14T16:00:00.000Z",
      }),
    );
    expect((await r.photos.get(PROJECT, "caph_1"))?.filePath).toBe(
      `${PROJECT}/photos/caph_1.jpg`,
    );
  });

  it("pins follow newer-edit-wins and keep their creator", async () => {
    const r = repo();
    await r.pins.upsert(pin("capin_1", { label: "AHU-3" }));
    await r.pins.upsert(
      pin("capin_1", {
        label: "AHU-3 north",
        createdBy: "someone-else",
        clientUpdatedAt: "2026-07-14T15:00:00.000Z",
      }),
    );
    const [stored] = await r.pins.list(PROJECT);
    expect(stored.label).toBe("AHU-3 north");
    expect(stored.createdBy).toBe("engineer@parkhill.com");
  });
});

describe("mock CA repository: reports and revisions", () => {
  it("assigns per-project report numbers and is idempotent on create", async () => {
    const r = repo();
    const a = await r.reports.create(reportInput("carep_a"));
    const again = await r.reports.create(reportInput("carep_a"));
    const b = await r.reports.create(reportInput("carep_b"));
    expect(a.reportNumber).toBe("001");
    expect(again.reportNumber).toBe("001");
    expect(b.reportNumber).toBe("002");
  });

  it("issues Rev 0, then Rev 1, leaving Rev 0 unchanged", async () => {
    const r = repo();
    await r.photos.upsert(photo("caph_1"));
    const report = await r.reports.create(reportInput());
    await r.reports.saveDraft(PROJECT, report.id, {
      ...report.draft,
      workSummary: "Original summary",
      items: [
        {
          id: "caitem_1",
          status: "deficient",
          description: "Exposed rebar",
          photos: [{ photoId: "caph_1", caption: "Footing" }],
        },
      ],
    });

    const first = await issueReport({
      repo: r,
      projectNumber: PROJECT,
      reportId: report.id,
      issuedBy: "a@parkhill.com",
      now: new Date("2026-11-12T15:00:00Z"),
    });
    expect(first?.revision.revision).toBe(0);
    expect(first?.report.latestRevision).toBe(0);
    expect(first?.report.hasUnissuedChanges).toBe(false);
    expect(first?.revision.photoPaths).toEqual({
      caph_1: `${PROJECT}/photos/caph_1.jpg`,
    });

    // Edit after issue: the draft changes, Rev 0 must not.
    const edited = await r.reports.saveDraft(PROJECT, report.id, {
      ...first!.report.draft,
      workSummary: "Revised summary",
    });
    expect(edited?.hasUnissuedChanges).toBe(true);
    await r.photos.upsert(
      photo("caph_1", { caption: "changed", clientUpdatedAt: "2026-11-13T00:00:00Z" }),
    );

    const second = await issueReport({
      repo: r,
      projectNumber: PROJECT,
      reportId: report.id,
      issuedBy: "a@parkhill.com",
      now: new Date("2026-11-14T15:00:00Z"),
    });
    expect(second?.revision.revision).toBe(1);

    const rev0 = await r.reports.getRevision(PROJECT, report.id, 0);
    expect(rev0?.content.workSummary).toBe("Original summary");
    expect(rev0?.content.items[0].photos[0].caption).toBe("Footing");
    expect(rev0?.dateIssued).toBe("2026-11-12T15:00:00.000Z");
    expect(rev0?.contentHash).toBe(first?.revision.contentHash);

    const revs = await r.reports.listRevisions(PROJECT, report.id);
    expect(revs.map((x) => x.revision)).toEqual([1, 0]);
  });

  it("revisions are create-only", async () => {
    const r = repo();
    const report = await r.reports.create(reportInput());
    const done = await issueReport({
      repo: r,
      projectNumber: PROJECT,
      reportId: report.id,
      issuedBy: "a",
    });
    await expect(r.reports.createRevision(done!.revision)).rejects.toBeInstanceOf(
      RevisionAlreadyExistsError,
    );
  });

  it("refuses to issue while a referenced photo is not uploaded", async () => {
    const r = repo();
    const report = await r.reports.create(reportInput());
    await r.reports.saveDraft(PROJECT, report.id, {
      ...report.draft,
      coverPhotoId: "caph_missing",
    });
    await expect(
      issueReport({ repo: r, projectNumber: PROJECT, reportId: report.id, issuedBy: "a" }),
    ).rejects.toBeInstanceOf(MissingPhotoError);
    expect(await r.reports.listRevisions(PROJECT, report.id)).toEqual([]);
  });

  it("a retried issue whose mark step failed completes without a duplicate", async () => {
    const r = repo();
    const report = await r.reports.create(reportInput());
    const now = new Date("2026-11-12T15:00:00Z");
    // Simulate: revision written, then the connection dropped before marking.
    const realMark = r.reports.markIssued;
    r.reports.markIssued = async () => {
      throw new Error("network");
    };
    await expect(
      issueReport({ repo: r, projectNumber: PROJECT, reportId: report.id, issuedBy: "a", now }),
    ).rejects.toThrow("network");
    r.reports.markIssued = realMark;

    const retry = await issueReport({
      repo: r,
      projectNumber: PROJECT,
      reportId: report.id,
      issuedBy: "a",
      now,
    });
    expect(retry?.revision.revision).toBe(0);
    expect(await r.reports.listRevisions(PROJECT, report.id)).toHaveLength(1);
  });
});

describe("mock CA repository: persistence", () => {
  it("survives a restart when given a data directory", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ca-mock-"));
    try {
      const first = createMockCaRepository({ dataDir: dir });
      await first.photos.upsert(photo("caph_1", { caption: "kept" }));
      const second = createMockCaRepository({ dataDir: dir });
      expect((await second.photos.get(PROJECT, "caph_1"))?.caption).toBe("kept");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
