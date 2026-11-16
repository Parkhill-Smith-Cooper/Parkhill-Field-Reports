import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createMockFileStore } from "@/lib/ca/files/mockFileStore";
import { caPhotoPath, isPathInProject, isSafeFilePath } from "@/lib/ca/paths";
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
      expect(await store.readUrl(p)).toBe(
        `/api/ca/files/${encodeURIComponent(PROJECT)}/photos/caph_1.jpg`,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
