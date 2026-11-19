import { describe, expect, it } from "vitest";

import type { CaRepository } from "@/lib/ca/contracts";
import { issueReport } from "@/lib/ca/issueReport";
import { createCosmosCaRepository } from "@/repositories/ca/cosmosCaRepository";
import { createMockCaRepository } from "@/repositories/ca/mockCaRepository";

import { fakeContainer } from "./fakeCosmos";
import { photo, pin, PROJECT, reportInput } from "./fixtures";

/**
 * The same behaviour, checked against both repository implementations: the
 * mock (used in development and tests) and the Cosmos one (run here against
 * an in-memory stand-in; never against a real account).
 */
const implementations: [string, () => CaRepository][] = [
  ["mock", () => createMockCaRepository({ dataDir: null })],
  [
    "cosmos (stand-in)",
    () =>
      createCosmosCaRepository({
        projects: fakeContainer(),
        capture: fakeContainer(),
        drawings: fakeContainer(),
        reports: fakeContainer(),
      }),
  ],
];

describe.each(implementations)("CA repository contract: %s", (_name, make) => {
  async function withProject() {
    const repo = make();
    await repo.projects.create({ projectNumber: PROJECT, name: "School", source: "manual" }, "eng@parkhill.com");
    return repo;
  }

  it("projects: unique by number, update, delete with children", async () => {
    const repo = await withProject();
    await expect(
      repo.projects.create({ projectNumber: PROJECT, name: "Again", source: "manual" }, "x"),
    ).rejects.toMatchObject({ name: "CaConflictError" });
    expect((await repo.projects.update(PROJECT, { name: "Renamed" }))?.name).toBe("Renamed");
    await repo.photos.upsert(photo("caph_1"));
    expect(await repo.projects.delete(PROJECT)).toBe(true);
    expect(await repo.projects.get(PROJECT)).toBeNull();
    expect(await repo.photos.list(PROJECT)).toEqual([]);
    expect(await repo.projects.delete(PROJECT)).toBe(false);
  });

  it("photos: idempotent; newer edit wins; file path fixed at first write", async () => {
    const repo = await withProject();
    await repo.photos.upsert(photo("caph_1"));
    await repo.photos.upsert(photo("caph_1")); // retry
    await repo.photos.upsert(photo("caph_1", { caption: "new", clientUpdatedAt: "2026-07-15T00:00:00.000Z", filePath: "x/y.jpg" }));
    await repo.photos.upsert(photo("caph_1", { caption: "stale", clientUpdatedAt: "2026-07-14T20:00:00.000Z" }));
    const list = await repo.photos.list(PROJECT);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ caption: "new", filePath: `${PROJECT}/photos/caph_1.jpg` });
    expect(list[0]).not.toHaveProperty("_etag");
    expect(list[0]).not.toHaveProperty("type");
    await repo.photos.upsert(photo("caph_1", { deleted: true, clientUpdatedAt: "2026-07-16T00:00:00.000Z" }));
    expect((await repo.photos.get(PROJECT, "caph_1"))?.deleted).toBe(true);
  });

  it("pins: newer edit wins and creation is preserved", async () => {
    const repo = await withProject();
    await repo.pins.upsert(pin("capin_1", { label: "a" }));
    await repo.pins.upsert(pin("capin_1", { label: "b", createdBy: "other", clientUpdatedAt: "2026-07-15T00:00:00.000Z" }));
    const [p] = await repo.pins.list(PROJECT);
    expect(p).toMatchObject({ label: "b", createdBy: "engineer@parkhill.com" });
  });

  it("reports: numbered per project, idempotent create, newer draft wins", async () => {
    const repo = await withProject();
    const a = await repo.reports.create(reportInput("carep_a"));
    const again = await repo.reports.create(reportInput("carep_a"));
    const b = await repo.reports.create(reportInput("carep_b"));
    expect([a.reportNumber, again.reportNumber, b.reportNumber]).toEqual(["001", "001", "002"]);
    await repo.reports.saveDraft(PROJECT, a.id, { ...a.draft, comments: "new" }, "2026-07-16T00:00:00.000Z");
    await repo.reports.saveDraft(PROJECT, a.id, { ...a.draft, comments: "old" }, "2026-07-15T00:00:00.000Z");
    expect((await repo.reports.get(PROJECT, a.id))?.draft.comments).toBe("new");
    expect((await repo.reports.list(PROJECT)).map((r) => r.reportNumber)).toEqual(["002", "001"]);
  });

  it("reports: discipline and author name are stored with the report", async () => {
    const repo = await withProject();
    const created = await repo.reports.create({ ...reportInput("carep_d"), discipline: "civil", createdByName: "Brett Rodgers" });
    expect(created).toMatchObject({ discipline: "civil", createdByName: "Brett Rodgers", reportNumber: "001" });
    // Saving the draft never changes them.
    await repo.reports.saveDraft(PROJECT, created.id, { ...created.draft, comments: "x" }, "2026-07-16T00:00:00.000Z");
    expect(await repo.reports.get(PROJECT, created.id)).toMatchObject({ discipline: "civil", createdByName: "Brett Rodgers" });
  });

  it("reports: search across projects by number, author, discipline or project", async () => {
    const repo = await withProject();
    await repo.projects.create({ projectNumber: "MOCK-2", name: "Fire Station", source: "manual" }, "x");
    await repo.reports.create({ ...reportInput("carep_s1"), discipline: "civil", createdByName: "Brett Rodgers" });
    await repo.reports.create({
      ...reportInput("carep_s2"),
      projectNumber: "MOCK-2",
      discipline: "electrical",
      createdByName: "Ana Diaz",
      updatedAt: "2026-07-20T00:00:00.000Z",
    });
    const ids = async (q: string) => (await repo.reports.search(q, 20)).map((r) => r.id);
    expect(await ids("brett")).toEqual(["carep_s1"]);
    expect(await ids("electrical")).toEqual(["carep_s2"]);
    expect(await ids("mock-2")).toEqual(["carep_s2"]);
    // Both are report 001 in their project; newest activity first.
    expect(await ids("001")).toEqual(["carep_s2", "carep_s1"]);
    // The limit keeps the newest, not whichever came first.
    expect((await repo.reports.search("001", 1)).map((r) => r.id)).toEqual(["carep_s2"]);
    expect(await ids("nobody")).toEqual([]);
  });

  it("photos: the report a photo was captured for is stored", async () => {
    const repo = await withProject();
    await repo.photos.upsert(photo("caph_r", { reportId: "carep_1" }));
    expect((await repo.photos.get(PROJECT, "caph_r"))?.reportId).toBe("carep_1");
  });

  it("issuing: Rev 0 then Rev 1; revisions are create-only and unchanged by later edits", async () => {
    const repo = await withProject();
    await repo.photos.upsert(photo("caph_1"));
    const report = await repo.reports.create(reportInput());
    await repo.reports.saveDraft(PROJECT, report.id, {
      ...report.draft,
      items: [{ id: "caitem_1", status: "deficient", description: "v1", photos: [{ photoId: "caph_1", caption: "c" }] }],
    });
    const r0 = await issueReport({ repo, projectNumber: PROJECT, reportId: report.id, issuedBy: "eng" });
    expect(r0?.revision.revision).toBe(0);
    await expect(repo.reports.createRevision(r0!.revision)).rejects.toMatchObject({ name: "RevisionAlreadyExistsError" });

    const draft = (await repo.reports.get(PROJECT, report.id))!.draft;
    await repo.reports.saveDraft(PROJECT, report.id, { ...draft, items: [{ ...draft.items[0], description: "v2" }] });
    expect((await repo.reports.get(PROJECT, report.id))?.hasUnissuedChanges).toBe(true);
    const r1 = await issueReport({ repo, projectNumber: PROJECT, reportId: report.id, issuedBy: "eng" });
    expect(r1?.revision.revision).toBe(1);

    expect((await repo.reports.getRevision(PROJECT, report.id, 0))?.content.items[0].description).toBe("v1");
    expect((await repo.reports.listRevisions(PROJECT, report.id)).map((r) => r.revision)).toEqual([1, 0]);
    expect(await repo.reports.deleteDraft(PROJECT, report.id)).toBe("issued");
  });

  it("drawings: stored and updated", async () => {
    const repo = await withProject();
    const drawing = {
      id: "cadwg_1",
      projectNumber: PROJECT,
      title: "Level 1",
      fileType: "image" as const,
      page: 1,
      pageCount: 1,
      originalFileName: "l1.png",
      filePath: `${PROJECT}/drawings/cadwg_1.png`,
      width: 100,
      height: 50,
      source: "upload" as const,
      isCurrent: true,
      uploadedAt: "2026-07-14T00:00:00.000Z",
      uploadedBy: "eng",
    };
    await repo.drawings.upsert(drawing);
    await repo.drawings.upsert({ ...drawing, isCurrent: false });
    expect(await repo.drawings.get(PROJECT, "cadwg_1")).toMatchObject({ isCurrent: false, title: "Level 1" });
    expect(await repo.drawings.list(PROJECT)).toHaveLength(1);
  });

  it("drawing sets: create-only, atomic sheet updates, removal is a tombstone", async () => {
    const repo = await withProject();
    const set = {
      id: "caset_1",
      projectNumber: PROJECT,
      fileName: "CD Set.pdf",
      filePath: `${PROJECT}/drawing-sets/caset_1.pdf`,
      sizeBytes: 1234,
      pageCount: 2,
      sheets: [
        { page: 1, sheetNumber: "G-001", sheetName: "", naming: "guess" as const },
        { page: 2, sheetNumber: "", sheetName: "", naming: "guess" as const },
      ],
      uploadedAt: "2026-11-17T10:00:00.000Z",
      uploadedBy: "eng",
    };
    await repo.drawingSets.create(set);
    // A retried create returns what is stored and changes nothing.
    expect(await repo.drawingSets.create({ ...set, fileName: "other.pdf" })).toMatchObject({ fileName: "CD Set.pdf" });

    await Promise.all([
      repo.drawingSets.updateSheets(PROJECT, "caset_1", (sheets) =>
        sheets.map((s) => (s.page === 1 ? { ...s, sheetName: "Cover Sheet", naming: "ai" as const } : s)),
      ),
      repo.drawingSets.updateSheets(PROJECT, "caset_1", (sheets) =>
        sheets.map((s) => (s.page === 2 ? { ...s, sheetNumber: "A-101", naming: "edited" as const } : s)),
      ),
    ]);
    const stored = await repo.drawingSets.get(PROJECT, "caset_1");
    expect(stored?.sheets).toEqual([
      { page: 1, sheetNumber: "G-001", sheetName: "Cover Sheet", naming: "ai" },
      { page: 2, sheetNumber: "A-101", sheetName: "", naming: "edited" },
    ]);
    expect(stored).not.toHaveProperty("type");
    expect(await repo.drawingSets.updateSheets(PROJECT, "caset_missing", (s) => s)).toBeNull();

    // Sets do not show up as drawings.
    expect(await repo.drawings.list(PROJECT)).toEqual([]);

    expect(await repo.drawingSets.remove(PROJECT, "caset_1", "eng")).toMatchObject({ removed: true, removedBy: "eng" });
    expect((await repo.drawingSets.list(PROJECT)).map((s) => s.removed)).toEqual([true]);
    expect(await repo.drawingSets.remove(PROJECT, "caset_missing", "eng")).toBeNull();
  });
});
