import { afterEach, describe, expect, it, vi } from "vitest";

import type { CaDrawingSource, CaRepository, CaSourceDrawing } from "@/lib/ca/contracts";
import {
  currentOffer,
  reconcile,
  resetDrawingSyncState,
  scheduleReconcile,
  RECONCILE_INTERVAL_MS,
  type DrawingSyncDeps,
} from "@/lib/ca/drawingSync";
import { createMockFileStore } from "@/lib/ca/files/mockFileStore";
import { mockDrawingSetPdf } from "@/lib/ca/mockDrawingSetPdf";
import { drawingsForReport, syncedSetId, syncedSheetDrawingId } from "@/lib/ca/syncedSets";
import { createCosmosCaRepository } from "@/repositories/ca/cosmosCaRepository";
import { createMockCaRepository } from "@/repositories/ca/mockCaRepository";
import type { CaDrawing } from "@/types/ca";

import { fakeContainer } from "./fakeCosmos";
import { PROJECT } from "./fixtures";

/**
 * Drawing sets synced from the CA application's Document Control: the
 * source says which set is current; Field Reports copies it into its own
 * file store, marks it current, and supersedes (never deletes) the rest.
 */

const offer = (version: number, extra: Partial<CaSourceDrawing> = {}): CaSourceDrawing => ({
  externalRef: `proj-uuid-v${version}`,
  title: "100% CD",
  revisionLabel: `v${version} — 100% CD`,
  isLatestApproved: true,
  fileType: "pdf",
  fileName: `CD v${version}.pdf`,
  ...extra,
});

/** A Document Control stand-in: `current` is what `/latest` returns. */
function fakeSource() {
  const state: { current: CaSourceDrawing | null; fetches: string[]; fail?: Error } = { current: offer(1), fetches: [] };
  const source: CaDrawingSource = {
    kind: "ca-app",
    async listLatest() {
      if (state.fail) throw state.fail;
      return state.current ? [state.current] : [];
    },
    async fetchFile(_p, ref) {
      state.fetches.push(ref);
      const bytes = mockDrawingSetPdf(ref);
      // A stream in small pieces, as ccr sends it.
      return {
        bytes: new ReadableStream<Uint8Array>({
          start(controller) {
            for (let i = 0; i < bytes.length; i += 100) controller.enqueue(bytes.slice(i, i + 100));
            controller.close();
          },
        }),
        contentType: "application/pdf",
        fileName: `${ref}.pdf`,
      };
    },
  };
  return { source, state };
}

const repos: [string, () => CaRepository][] = [
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

function sheet(id: string, drawingSetId: string | undefined, isCurrent = true): CaDrawing {
  return {
    id,
    projectNumber: PROJECT,
    title: id,
    fileType: drawingSetId ? "pdf" : "image",
    page: 1,
    pageCount: 1,
    originalFileName: `${id}.png`,
    filePath: `${PROJECT}/drawings/${id}.png`,
    width: 100,
    height: 50,
    source: drawingSetId ? "ca-app" : "upload",
    ...(drawingSetId ? { drawingSetId, externalRef: "x" } : {}),
    isCurrent,
    uploadedAt: "2026-11-19T10:00:00.000Z",
    uploadedBy: "eng",
  };
}

describe.each(repos)("drawing sync: %s", (_name, makeRepo) => {
  async function setup() {
    const repo = makeRepo();
    await repo.projects.create({ projectNumber: PROJECT, name: "School", source: "ca-app" }, "eng");
    const files = createMockFileStore({ dataDir: null });
    const { source, state } = fakeSource();
    const deps: DrawingSyncDeps = { repo, files, source, now: () => new Date("2026-11-19T12:00:00.000Z") };
    return { repo, files, deps, state };
  }

  it("copies the current set into the file store, unindexed and current", async () => {
    const { repo, files, deps, state } = await setup();
    const result = await reconcile(deps, PROJECT);
    const id = syncedSetId("proj-uuid-v1");
    expect(result).toEqual({ status: "current", setId: id, ingested: true });

    const set = await repo.drawingSets.get(PROJECT, id);
    expect(set).toMatchObject({
      source: "ca-app",
      externalRef: "proj-uuid-v1",
      revisionLabel: "v1 — 100% CD",
      title: "100% CD",
      isCurrent: true,
      indexed: false,
      pageCount: 0,
      sheets: [],
      syncedAt: "2026-11-19T12:00:00.000Z",
    });
    const stored = await files.get(set!.filePath);
    expect(new TextDecoder().decode(stored!.bytes.subarray(0, 5))).toBe("%PDF-");
    expect(set!.sizeBytes).toBe(stored!.bytes.length);

    // Idempotent: a second run (or a push racing a listing) copies nothing again.
    expect(await reconcile(deps, PROJECT)).toEqual({ status: "current", setId: id, ingested: false });
    expect(state.fetches).toEqual(["proj-uuid-v1"]);
    expect(await repo.drawingSets.list(PROJECT)).toHaveLength(1);
  });

  it("a newer version becomes current; the old set and its sheets are kept, superseded", async () => {
    const { repo, deps, state } = await setup();
    await reconcile(deps, PROJECT);
    const v1 = syncedSetId("proj-uuid-v1");
    await repo.drawings.upsert(sheet(syncedSheetDrawingId(v1, 1), v1));
    await repo.drawings.upsert(sheet("cadwg_manual", undefined));

    state.current = offer(2);
    await reconcile(deps, PROJECT);
    const v2 = syncedSetId("proj-uuid-v2");

    const sets = await repo.drawingSets.list(PROJECT);
    expect(sets.map((s) => [s.id, s.isCurrent, s.removed ?? false])).toEqual([
      [v1, false, false],
      [v2, true, false],
    ]);
    const drawings = new Map((await repo.drawings.list(PROJECT)).map((d) => [d.id, d.isCurrent]));
    expect(drawings.get(syncedSheetDrawingId(v1, 1))).toBe(false);
    // Hand-added drawings are not the sync's to change.
    expect(drawings.get("cadwg_manual")).toBe(true);
  });

  it("a version deleted in the CA app: the previous one is current again; nothing is deleted", async () => {
    const { repo, deps, state } = await setup();
    await reconcile(deps, PROJECT);
    state.current = offer(2);
    await reconcile(deps, PROJECT);
    state.current = offer(1); // v2 was a mistaken upload, deleted in ccr
    expect(await reconcile(deps, PROJECT)).toMatchObject({ status: "current", ingested: false });
    const sets = await repo.drawingSets.list(PROJECT);
    expect(sets.map((s) => s.isCurrent)).toEqual([true, false]);
    expect(state.fetches).toEqual(["proj-uuid-v1", "proj-uuid-v2"]);
  });

  it("no set in the CA app: nothing current, nothing removed", async () => {
    const { repo, deps, state } = await setup();
    await reconcile(deps, PROJECT);
    state.current = null;
    expect(await reconcile(deps, PROJECT)).toEqual({ status: "none" });
    expect((await repo.drawingSets.list(PROJECT)).map((s) => [s.isCurrent, s.removed ?? false])).toEqual([[false, false]]);
  });

  it("a set imported by hand before syncing existed is used, not copied again", async () => {
    const { repo, deps, state } = await setup();
    await repo.drawingSets.create({
      id: "caset_hand",
      projectNumber: PROJECT,
      fileName: "CD.pdf",
      filePath: `${PROJECT}/drawing-sets/caset_hand.pdf`,
      sizeBytes: 10,
      pageCount: 1,
      sheets: [{ page: 1, sheetNumber: "A-101", sheetName: "", naming: "guess" }],
      uploadedAt: "2026-11-18T10:00:00.000Z",
      uploadedBy: "eng",
      source: "ca-app",
      externalRef: "proj-uuid-v1",
    });
    expect(await reconcile(deps, PROJECT)).toEqual({ status: "current", setId: "caset_hand", ingested: false });
    expect(state.fetches).toEqual([]);
    expect(await repo.drawingSets.get(PROJECT, "caset_hand")).toMatchObject({ isCurrent: true });
  });

  it("refuses a file that is not a PDF and records nothing", async () => {
    const { repo, deps } = await setup();
    deps.source = {
      ...deps.source!,
      async fetchFile() {
        return { bytes: new TextEncoder().encode("<html>login</html>"), contentType: "text/html", fileName: "x" };
      },
    };
    await expect(reconcile(deps, PROJECT)).rejects.toThrow(/not a PDF/);
    expect(await repo.drawingSets.list(PROJECT)).toEqual([]);
  });

  it("ignores projects not set up here, and does nothing without a source", async () => {
    const { deps } = await setup();
    expect(await reconcile(deps, "OTHER-1")).toEqual({ status: "no-project" });
    expect(await reconcile({ ...deps, source: null }, PROJECT)).toEqual({ status: "no-source" });
  });
});

describe("scheduleReconcile", () => {
  afterEach(() => resetDrawingSyncState());

  async function deps() {
    const repo = createMockCaRepository({ dataDir: null });
    await repo.projects.create({ projectNumber: PROJECT, name: "School", source: "ca-app" }, "eng");
    const { source, state } = fakeSource();
    const listLatest = vi.spyOn(source, "listLatest");
    return { d: { repo, files: createMockFileStore({ dataDir: null }), source }, state, listLatest };
  }

  it("runs once per interval unless forced, and one run per project at a time", async () => {
    const { d, listLatest } = await deps();
    const t0 = 1_000_000;
    const [a, b] = [scheduleReconcile(() => d, PROJECT, { nowMs: t0 }), scheduleReconcile(() => d, PROJECT, { nowMs: t0 })];
    expect(a).toBe(b);
    await a;
    expect(await scheduleReconcile(() => d, PROJECT, { nowMs: t0 + 1000 })).toBeNull();
    expect(listLatest).toHaveBeenCalledTimes(1);
    await scheduleReconcile(() => d, PROJECT, { nowMs: t0 + 1000, force: true });
    expect(listLatest).toHaveBeenCalledTimes(2);
    await scheduleReconcile(() => d, PROJECT, { nowMs: t0 + 1000 + RECONCILE_INTERVAL_MS });
    expect(listLatest).toHaveBeenCalledTimes(3);
  });

  it("a push during a run triggers one more run, so the newest version is not missed", async () => {
    const { d, state, listLatest } = await deps();
    const first = scheduleReconcile(() => d, PROJECT, { nowMs: 1 });
    state.current = offer(2);
    scheduleReconcile(() => d, PROJECT, { nowMs: 2, force: true });
    expect(await first).toMatchObject({ setId: syncedSetId("proj-uuid-v2") });
    expect(listLatest).toHaveBeenCalledTimes(2);
  });

  it("never throws: a failure is logged, and the next request tries again", async () => {
    const { d, state, listLatest } = await deps();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.fail = new Error("ccr down");
    expect(await scheduleReconcile(() => d, PROJECT, { nowMs: 1 })).toBeNull();
    state.fail = undefined;
    expect(await scheduleReconcile(() => d, PROJECT, { nowMs: 2 })).toMatchObject({ status: "current" });
    expect(listLatest).toHaveBeenCalledTimes(2);
  });
});

describe("synced set ids and report drawings", () => {
  it("derives stable ids that pass the generated-id rules", () => {
    const id = syncedSetId("5f0c-uuid-v3");
    expect(id).toBe("dcset_5f0c_uuid_v3");
    expect(syncedSetId("5f0c-uuid-v3")).toBe(id);
    const long = syncedSetId(`${"x".repeat(80)}-v1`);
    expect(long).toMatch(/^dcset_[0-9a-f]{24}$/);
    expect(long).not.toBe(syncedSetId(`${"x".repeat(80)}-v2`));
    expect(syncedSheetDrawingId(long, 120)).toMatch(/^[A-Za-z0-9_]{1,64}$/);
  });

  it("the latest approved PDF is the current offer", () => {
    expect(currentOffer([{ ...offer(1), fileType: "image" }, offer(2)])?.externalRef).toBe("proj-uuid-v2");
    expect(currentOffer([{ ...offer(1), isLatestApproved: false }])).toBeNull();
  });

  it("a report sees its own set's sheets plus hand-added drawings", () => {
    const drawings = [
      sheet("a", "dcset_v1"),
      sheet("b", "dcset_v2"),
      sheet("c", undefined),
      sheet("d", "caset_hand"), // a set uploaded by hand
    ];
    const synced = new Set(["dcset_v1", "dcset_v2"]);
    expect(drawingsForReport(drawings, { setId: "dcset_v1" }, synced).map((d) => d.id)).toEqual(["a", "c", "d"]);
    expect(drawingsForReport(drawings, undefined, synced).map((d) => d.id)).toEqual(["a", "b", "c", "d"]);
  });
});
