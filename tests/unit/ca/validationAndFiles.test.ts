import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createMockFileStore } from "@/lib/ca/files/mockFileStore";
import { caDrawingSetPath, caPhotoPath, isPathInProject, isSafeFilePath } from "@/lib/ca/paths";
import { itemNumber, reportState } from "@/lib/ca/reportContent";
import { stableStringify } from "@/lib/ca/revisions";
import { hasDeficientItems } from "@/lib/ca/status";
import {
  validateNewCaProject,
  validatePin,
  validateReportContent,
} from "@/lib/ca/validation";

import { PROJECT, pin, reportInput } from "./fixtures";

describe("report content rules", () => {
  it("only Deficient triggers the notice", () => {
    expect(hasDeficientItems([{ status: "in-progress" }, { status: "corrected" }])).toBe(false);
    expect(hasDeficientItems([{ status: "complete" }, { status: "deficient" }])).toBe(true);
  });

  it("derives draft / issued / revising", () => {
    expect(reportState({ latestRevision: null, hasUnissuedChanges: false })).toBe("draft");
    expect(reportState({ latestRevision: 0, hasUnissuedChanges: false })).toBe("issued");
    expect(reportState({ latestRevision: 2, hasUnissuedChanges: true })).toBe("revising");
  });

  it("numbers items like the template", () => {
    expect(itemNumber(0)).toBe("001");
    expect(itemNumber(41)).toBe("042");
  });

  it("hashes independently of key order", () => {
    expect(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(
      stableStringify({ a: [{ c: 3, d: 2 }], b: 1 }),
    );
  });
});

describe("CA validation", () => {
  it("accepts a fresh report and rejects bad statuses", () => {
    const content = reportInput().draft;
    expect(validateReportContent(content)).toBeNull();
    expect(
      validateReportContent({
        ...content,
        items: [{ id: "caitem_1", status: "bogus", description: "", photos: [] }],
      }),
    ).toMatch(/status/);
  });

  it("rejects malformed dates and times", () => {
    const content = reportInput().draft;
    expect(validateReportContent({ ...content, dateVisited: "07/14/2026" })).toMatch(/Date/);
    expect(validateReportContent({ ...content, timeVisited: "9:30am" })).toMatch(/Time/);
  });

  it("keeps pins on the sheet", () => {
    expect(validatePin(pin("capin_1"))).toBeNull();
    expect(validatePin(pin("capin_1", { x: 1.2 }))).toMatch(/between 0 and 1/);
  });

  it("validates new projects", () => {
    expect(
      validateNewCaProject({ projectNumber: PROJECT, name: "School", source: "manual" }),
    ).toBeNull();
    expect(
      validateNewCaProject({ projectNumber: "../etc", name: "x", source: "manual" }),
    ).toMatch(/project number/);
    expect(
      validateNewCaProject({ projectNumber: "24-1", name: "x", source: "dropbox" }),
    ).toMatch(/source/);
  });
});

describe("CA file paths and the mock file store", () => {
  it("rejects traversal and absolute paths", () => {
    expect(isSafeFilePath(caPhotoPath(PROJECT, "caph_1"))).toBe(true);
    for (const bad of ["../x", "a/../b", "/abs", "a\\b", "", "a//b"]) {
      expect(isSafeFilePath(bad)).toBe(false);
    }
    expect(isPathInProject(`${PROJECT}/photos/x.jpg`, PROJECT)).toBe(true);
    expect(isPathInProject(`OTHER/photos/x.jpg`, PROJECT)).toBe(false);
  });

  it("stores immutably in memory, even for concurrent first uploads", async () => {
    const store = createMockFileStore({ dataDir: null });
    const p = caPhotoPath(PROJECT, "caph_1");
    await Promise.all([
      store.put(p, new Uint8Array([1]), "image/jpeg"),
      store.put(p, new Uint8Array([2]), "image/png"),
    ]);
    expect(await store.get(p)).toEqual({ bytes: new Uint8Array([1]), contentType: "image/jpeg" });
  });

  it("stores immutably on disk and refuses unsafe paths", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ca-files-"));
    try {
      const store = createMockFileStore({ dataDir: dir });
      const p = caPhotoPath(PROJECT, "caph_1");
      await store.put(p, new Uint8Array([1, 2, 3]), "image/jpeg");
      await store.put(p, new Uint8Array([9, 9, 9]), "image/jpeg");
      const got = await store.get(p);
      expect(Array.from(got!.bytes)).toEqual([1, 2, 3]);
      expect(got!.contentType).toBe("image/jpeg");
      await expect(store.put("../evil", new Uint8Array([1]), "x")).rejects.toThrow();

      // Concurrent first uploads of one path: exactly one wins, whole.
      const q = caPhotoPath(PROJECT, "caph_2");
      await Promise.all(
        Array.from({ length: 8 }, (_, i) => store.put(q, new Uint8Array(4096).fill(i + 1), `image/t${i + 1}`)),
      );
      const raced = await store.get(q);
      const winner = raced!.bytes[0];
      expect(raced!.bytes.every((b) => b === winner)).toBe(true);
      expect(raced!.contentType).toBe(`image/t${winner}`);
      const folder = path.dirname(path.join(dir, "files", ...q.split("/")));
      expect(fs.readdirSync(folder).some((f) => f.endsWith(".tmp"))).toBe(false);
      expect(await store.readUrl(p)).toBe(
        `/api/ca/files/${encodeURIComponent(PROJECT)}/photos/caph_1.jpg`,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("joins staged blocks into one immutable file, in memory and on disk", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ca-blocks-"));
    try {
      for (const store of [createMockFileStore({ dataDir: null }), createMockFileStore({ dataDir: dir })]) {
        const p = caDrawingSetPath(PROJECT, "caset_1");
        await store.stageBlock(p, 1, new Uint8Array([4, 5]));
        await store.stageBlock(p, 0, new Uint8Array([9]));
        await store.stageBlock(p, 0, new Uint8Array([1, 2, 3])); // a retried block replaces it
        expect(await store.exists(p)).toBe(false);
        await expect(store.commitBlocks(p, 3, "application/pdf")).rejects.toMatchObject({ name: "MissingBlockError" });
        expect(await store.commitBlocks(p, 2, "application/pdf")).toEqual({ sizeBytes: 5 });
        expect(await store.get(p)).toEqual({ bytes: new Uint8Array([1, 2, 3, 4, 5]), contentType: "application/pdf" });
        // Committed: further blocks and commits change nothing.
        await store.stageBlock(p, 0, new Uint8Array([7]));
        expect(await store.commitBlocks(p, 1, "application/pdf")).toEqual({ sizeBytes: 5 });
        expect(Array.from((await store.get(p))!.bytes)).toEqual([1, 2, 3, 4, 5]);
      }
      const folder = path.join(dir, "files", PROJECT, "drawing-sets");
      expect(fs.readdirSync(folder).some((f) => f.endsWith(".blocks"))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
