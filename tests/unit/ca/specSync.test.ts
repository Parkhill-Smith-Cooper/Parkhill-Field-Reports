import { afterEach, describe, expect, it } from "vitest";

import type { CaRepository, CaSourceSpecSection, CaSpecSource } from "@/lib/ca/contracts";
import { createMockFileStore } from "@/lib/ca/files/mockFileStore";
import { mockDrawingSetPdf } from "@/lib/ca/mockDrawingSetPdf";
import { currentSpecSections } from "@/lib/ca/specSections";
import {
  reconcileSpecs,
  resetSpecSyncState,
  scheduleSpecReconcile,
  type SpecSyncDeps,
} from "@/lib/ca/specSync";
import { syncedSpecSectionId } from "@/lib/ca/syncedSets";
import { createCosmosCaRepository } from "@/repositories/ca/cosmosCaRepository";
import { createMockCaRepository } from "@/repositories/ca/mockCaRepository";

import { fakeContainer } from "./fakeCosmos";
import { PROJECT } from "./fixtures";

/**
 * Specification sections synced from the CA application's Document Control:
 * the source says which revision of each section is current; Field Reports
 * copies what it lacks, marks exactly those current, and never deletes.
 */

const offer = (sectionKey: string, revision: number, extra: Partial<CaSourceSpecSection> = {}): CaSourceSpecSection => ({
  externalRef: `proj-spec-${sectionKey}-r${revision}`,
  sectionKey,
  sectionNumber: `${sectionKey.slice(0, 2)} ${sectionKey.slice(2, 4)} ${sectionKey.slice(4, 6)}`,
  division: sectionKey.slice(0, 2),
  title: `Section ${sectionKey}`,
  revision,
  revisionLabel: `Rev 0${revision} — Issue ${revision}`,
  isLatestApproved: true,
  fileType: "pdf",
  fileName: `${sectionKey}.pdf`,
  ...extra,
});

/** A Document Control stand-in: `current` is what `/latest` returns. */
function fakeSource() {
  const state: { current: CaSourceSpecSection[]; fetches: string[]; broken: Set<string>; fail?: Error } = {
    current: [offer("033000", 1), offer("051200", 1), offer("092900", 1)],
    fetches: [],
    broken: new Set(),
  };
  const source: CaSpecSource = {
    kind: "ca-app",
    async listCurrent() {
      if (state.fail) throw state.fail;
      return state.current;
    },
    async fetchFile(_p, ref) {
      state.fetches.push(ref);
      const bytes = state.broken.has(ref) ? new TextEncoder().encode("<html>not a pdf</html>") : mockDrawingSetPdf(ref);
      return { bytes, contentType: "application/pdf", fileName: `${ref}.pdf` };
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

afterEach(() => resetSpecSyncState());

describe.each(repos)("specification sync: %s", (_name, makeRepo) => {
  async function setup() {
    const repo = makeRepo();
    await repo.projects.create({ projectNumber: PROJECT, name: "School", source: "ca-app" }, "eng");
    const files = createMockFileStore({ dataDir: null });
    const { source, state } = fakeSource();
    const deps: SpecSyncDeps = { repo, files, source, now: () => new Date("2026-11-19T12:00:00.000Z") };
    return { repo, files, deps, state };
  }

  const currentKeys = async (repo: CaRepository) =>
    currentSpecSections(await repo.specSections.list(PROJECT)).map((s) => `${s.sectionKey}:r${s.revision}`);

  it("first sync copies every section, current; a repeat copies nothing", async () => {
    const { repo, files, deps, state } = await setup();
    expect(await reconcileSpecs(deps, PROJECT)).toEqual({ status: "synced", current: 3, ingested: 3, failed: 0 });
    expect(await currentKeys(repo)).toEqual(["033000:r1", "051200:r1", "092900:r1"]);

    const stored = await repo.specSections.get(PROJECT, syncedSpecSectionId("proj-spec-033000-r1"));
    expect(stored).toMatchObject({
      sectionNumber: "03 30 00",
      revisionLabel: "Rev 01 — Issue 1",
      source: "ca-app",
      isCurrent: true,
      syncedAt: "2026-11-19T12:00:00.000Z",
    });
    const file = await files.get(stored!.filePath);
    expect(new TextDecoder().decode(file!.bytes.subarray(0, 5))).toBe("%PDF-");

    expect(await reconcileSpecs(deps, PROJECT)).toEqual({ status: "synced", current: 3, ingested: 0, failed: 0 });
    expect(state.fetches).toHaveLength(3);
  });

  it("a new revision supersedes only its own section, and the old one is kept", async () => {
    const { repo, deps, state } = await setup();
    await reconcileSpecs(deps, PROJECT);
    state.current = [offer("033000", 2), offer("051200", 1), offer("092900", 1)];
    expect(await reconcileSpecs(deps, PROJECT)).toMatchObject({ ingested: 1 });
    expect(await currentKeys(repo)).toEqual(["033000:r2", "051200:r1", "092900:r1"]);
    const all = await repo.specSections.list(PROJECT);
    expect(all).toHaveLength(4);
    expect(all.find((s) => s.revision === 1 && s.sectionKey === "033000")?.isCurrent).toBe(false);
  });

  it("a deleted revision makes the previous one current again", async () => {
    const { repo, deps, state } = await setup();
    await reconcileSpecs(deps, PROJECT);
    state.current = [offer("033000", 2), offer("051200", 1), offer("092900", 1)];
    await reconcileSpecs(deps, PROJECT);
    state.current = [offer("033000", 1), offer("051200", 1), offer("092900", 1)];
    expect(await reconcileSpecs(deps, PROJECT)).toMatchObject({ ingested: 0 });
    expect(await currentKeys(repo)).toEqual(["033000:r1", "051200:r1", "092900:r1"]);
  });

  it("a section the CA application no longer lists stops being current", async () => {
    const { repo, deps, state } = await setup();
    await reconcileSpecs(deps, PROJECT);
    state.current = [offer("033000", 1)];
    await reconcileSpecs(deps, PROJECT);
    expect(await currentKeys(repo)).toEqual(["033000:r1"]);
    expect(await repo.specSections.list(PROJECT)).toHaveLength(3);
  });

  it("a corrected title reaches the current revision", async () => {
    const { repo, deps, state } = await setup();
    await reconcileSpecs(deps, PROJECT);
    state.current = [offer("033000", 1, { title: "Cast-in-Place Concrete" }), offer("051200", 1), offer("092900", 1)];
    await reconcileSpecs(deps, PROJECT);
    expect((await repo.specSections.get(PROJECT, syncedSpecSectionId("proj-spec-033000-r1")))?.title).toBe(
      "Cast-in-Place Concrete",
    );
  });

  it("one bad file does not block the rest; its section keeps the previous revision", async () => {
    const { repo, deps, state } = await setup();
    await reconcileSpecs(deps, PROJECT);
    state.current = [offer("033000", 2), offer("051200", 2), offer("092900", 1)];
    state.broken.add("proj-spec-033000-r2");
    expect(await reconcileSpecs(deps, PROJECT)).toMatchObject({ ingested: 1, failed: 1 });
    expect(await currentKeys(repo)).toEqual(["033000:r1", "051200:r2", "092900:r1"]);

    // Fixed upstream: the next run picks it up.
    state.broken.clear();
    expect(await reconcileSpecs(deps, PROJECT)).toMatchObject({ ingested: 1, failed: 0 });
    expect(await currentKeys(repo)).toEqual(["033000:r2", "051200:r2", "092900:r1"]);
  });

  it("an unreachable source changes nothing; the scheduler reports null and allows a retry", async () => {
    const { repo, deps, state } = await setup();
    await reconcileSpecs(deps, PROJECT);
    state.fail = new Error("down");
    await expect(reconcileSpecs(deps, PROJECT)).rejects.toThrow("down");
    expect(await scheduleSpecReconcile(() => deps, PROJECT, { force: true })).toBeNull();
    expect(await currentKeys(repo)).toHaveLength(3);
  });

  it("reports a missing project or source without touching anything", async () => {
    const { deps } = await setup();
    expect(await reconcileSpecs({ ...deps, source: null }, PROJECT)).toEqual({ status: "no-source" });
    expect(await reconcileSpecs(deps, "NOPE-1")).toEqual({ status: "no-project" });
  });
});
