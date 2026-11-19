import { describe, expect, it } from "vitest";

import type { CaDrawingView } from "@/hooks/ca/useCaDrawings";
import { buildReportLocations } from "@/lib/ca/reportLocations";
import { defaultSheet, reportSheetChoices } from "@/lib/ca/reportSheets";
import { syncedSheetDrawingId } from "@/lib/ca/syncedSets";
import { validateReportContent } from "@/lib/ca/validation";
import type { CaDrawingSet } from "@/types/ca";

import { PROJECT, reportInput } from "./fixtures";

/**
 * A report lists the sheets of the drawing set it was made with: every
 * sheet, opened or not, shown as current for this report even after a newer
 * set arrives; plus drawings added by hand.
 */

const set = (id: string, version: number, extra: Partial<CaDrawingSet> = {}): CaDrawingSet => ({
  id,
  projectNumber: PROJECT,
  fileName: `CD v${version}.pdf`,
  filePath: `${PROJECT}/drawing-sets/${id}.pdf`,
  sizeBytes: 1,
  pageCount: 3,
  sheets: [
    { page: 1, sheetNumber: "G-001", sheetName: "COVER", naming: "ai" },
    { page: 2, sheetNumber: "A-101", sheetName: "LEVEL 1 FLOOR PLAN", naming: "ai" },
    { page: 3, sheetNumber: "", sheetName: "", naming: "guess" },
  ],
  uploadedAt: `2026-11-1${version}T00:00:00.000Z`,
  uploadedBy: "sync",
  source: "ca-app",
  externalRef: `p-v${version}`,
  revisionLabel: `v${version} — 100% CD`,
  isCurrent: version === 2,
  ...extra,
});

const view = (id: string, extra: Partial<CaDrawingView> = {}): CaDrawingView => ({
  id,
  projectNumber: PROJECT,
  title: id,
  fileType: "pdf",
  page: 1,
  pageCount: 1,
  originalFileName: "x",
  filePath: `${PROJECT}/drawings/${id}.png`,
  width: 100,
  height: 50,
  source: "upload",
  isCurrent: true,
  uploadedAt: "2026-11-19T00:00:00.000Z",
  uploadedBy: "eng",
  src: "blob:x",
  offlineReady: true,
  ...extra,
});

const v1 = set("dcset_p_v1", 1);
const v2 = set("dcset_p_v2", 2);

describe("reportSheetChoices", () => {
  it("lists every sheet of the report's set, opened or not, then hand-added drawings", () => {
    const opened = view(syncedSheetDrawingId(v2.id, 2), {
      drawingSetId: v2.id,
      page: 2,
      source: "ca-app",
      title: "Page 2", // named before AI finished
      sheetNumber: "A-101",
    });
    const choices = reportSheetChoices(
      [opened, view("cadwg_hand"), view(syncedSheetDrawingId(v1.id, 2), { drawingSetId: v1.id, page: 2, isCurrent: false })],
      { setId: v2.id },
      [v1, v2],
    );
    expect(choices.map((c) => [c.id, c.unrendered ?? false])).toEqual([
      [syncedSheetDrawingId(v2.id, 1), true],
      [opened.id, false],
      [syncedSheetDrawingId(v2.id, 3), true],
      ["cadwg_hand", false],
    ]);
    // The set's (AI) name wins over the one the image was made with.
    expect(choices[1]).toMatchObject({ title: "LEVEL 1 FLOOR PLAN", sheetNumber: "A-101" });
    expect(choices[2]).toMatchObject({ title: "Page 3", revisionLabel: "v2 — 100% CD", drawingSetId: v2.id });
    expect(defaultSheet(choices)?.id).toBe(opened.id);
  });

  it("an older report keeps its own (superseded) set's sheets, shown as current", () => {
    const old = view(syncedSheetDrawingId(v1.id, 2), { drawingSetId: v1.id, page: 2, isCurrent: false });
    const choices = reportSheetChoices([old], { setId: v1.id }, [v1, v2]);
    const shown = choices.find((c) => c.id === old.id);
    expect(shown).toMatchObject({ isCurrent: true });
    expect(shown?.unrendered).toBeFalsy();
    expect(choices.some((c) => c.drawingSetId === v2.id)).toBe(false);
  });

  it("with nothing opened yet, starts on the first floor plan", () => {
    expect(defaultSheet(reportSheetChoices([], { setId: v2.id }, [v2]))?.page).toBe(2);
  });

  it("a set still being listed shows no placeholders; a report with no set sees every drawing", () => {
    expect(reportSheetChoices([], { setId: "dcset_x" }, [set("dcset_x", 3, { indexed: false, sheets: [], pageCount: 0 })])).toEqual([]);
    const all = [view("a", { drawingSetId: v1.id }), view("b")];
    expect(reportSheetChoices(all, undefined, [v1, v2]).map((d) => d.id)).toEqual(["a", "b"]);
  });
});

describe("drawing set in the report", () => {
  it("is valid report content", () => {
    const content = reportInput().draft;
    expect(validateReportContent({ ...content, drawingSet: { setId: "dcset_p_v2", revisionLabel: "v2 — 100% CD" } })).toBeNull();
    expect(validateReportContent({ ...content, drawingSet: { setId: "../x" } })).toMatch(/drawing set/);
  });

  it("labels a set sheet's photo location with the set's version", () => {
    const content = { items: [{ id: "i", status: "complete" as const, description: "", photos: [{ photoId: "p", caption: "" }] }] };
    const pins = [{ id: "pin", drawingId: "d", createdAt: "2026-11-19T00:00:00.000Z", label: "", x: 0.5, y: 0.5 }];
    const photos = [{ id: "p", caption: "c", pinId: "pin" }];
    const drawing = { id: "d", title: "LEVEL 1 FLOOR PLAN", sheetNumber: "A-101", filePath: "f", width: 1, height: 1 };
    const [synced] = buildReportLocations({
      content,
      pins,
      photos,
      drawings: [{ ...drawing, drawingSetId: "dcset_p_v2", revisionLabel: "v2 — 100% CD" }],
    });
    expect(synced.subtitle).toBe("A-101 · LEVEL 1 FLOOR PLAN · v2 — 100% CD");
    // A single sheet added by hand reads as before.
    const [hand] = buildReportLocations({ content, pins, photos, drawings: [{ ...drawing, revisionLabel: "MOCK 100% CD" }] });
    expect(hand.subtitle).toBe("A-101 · LEVEL 1 FLOOR PLAN");
  });
});
